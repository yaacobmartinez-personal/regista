"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Role, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireMembership, ROLE_LABEL, ROLE_SUMMARY } from "@/lib/authz";
import { recordAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { appOrigin } from "@/lib/urls";
import { sendTemplate } from "@/lib/email";
import { createSecureToken, invitationExpiry, INVITATION_TTL_HOURS } from "@/lib/tokens";
import { TeamInvite, teamInviteText } from "@/emails/team-invite";
import type { InviteState } from "./shared";

/**
 * Team management. Every action requires ADMIN in the tenant being changed, and
 * matches rows on (id, tenantId) so an id from another organization never
 * resolves.
 */

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  // Taken from the schema rather than restated, so adding a role is a compile
  // error at the places that need updating instead of a silent rejection here.
  role: z.enum(Role),
});

/**
 * Strip anything that could break out of a mail header.
 *
 * The organization and inviter names are user-controlled and land in the
 * Subject line, so newlines and control characters are removed before they get
 * there.
 */
function headerSafe(value: string, fallback: string): string {
  const cleaned = Array.from(value)
    .map((char) => {
      const code = char.charCodeAt(0);
      // Control characters (including CR/LF) become spaces so nothing can
      // terminate the header or inject a second one.
      return code < 32 || code === 127 ? " " : char;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 78);
  return cleaned || fallback;
}


/**
 * Apply a change to a membership only if it leaves at least one admin.
 *
 * The count and the write happen in one transaction, behind a row lock on the
 * tenant's admin memberships. Counting outside the transaction was a race: two
 * admins acting at the same moment both saw two admins, both passed the guard,
 * and the organization ended up with none — with no way back in, since the team
 * page itself requires an admin.
 *
 * Returns false when the change was refused.
 */
async function withLastAdminGuard(
  tenantId: string,
  membershipId: string,
  isRemovingAdmin: (currentRole: Role) => boolean,
  apply: (tx: Prisma.TransactionClient, membershipId: string) => Promise<void>,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const membership = await tx.membership.findFirst({
      where: { id: membershipId, tenantId },
      select: { id: true, role: true },
    });
    if (!membership) return false;

    if (isRemovingAdmin(membership.role)) {
      // Serialise against other admin changes in this tenant.
      await tx.$queryRaw`SELECT id FROM "Membership" WHERE "tenantId" = ${tenantId} AND role = 'ADMIN' FOR UPDATE`;
      const admins = await tx.membership.count({
        where: { tenantId, role: "ADMIN" },
      });
      if (admins <= 1) return false;
    }

    await apply(tx, membership.id);
    return true;
  });
}

export async function inviteMember(
  _prev: InviteState | undefined,
  formData: FormData,
): Promise<InviteState> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const ctx = await requireMembership(tenantSlug, "ADMIN");

  // Invitations are outbound mail from a verified sending domain, so an
  // unbounded invite button is a phishing amplifier. Capped per organization
  // and per admin.
  const perTenant = rateLimit(`invite:tenant:${ctx.tenant.id}`, 50, 24 * 60 * 60);
  const perActor = rateLimit(`invite:actor:${ctx.userId}`, 20, 60 * 60);
  if (!perTenant.ok || !perActor.ok) {
    return { error: "You've sent a lot of invitations recently. Try again later." };
  }

  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    const fieldErrors: InviteState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as "email" | "role";
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const { email, role } = parsed.data;

  // Saying "already on the team" is not a disclosure: an admin can see the
  // member list on this very page.
  const existingMember = await prisma.membership.findFirst({
    where: { tenantId: ctx.tenant.id, user: { email } },
    select: { id: true },
  });
  if (existingMember) return { alreadyMember: true, invitedEmail: email };

  // Re-inviting replaces any outstanding invitation rather than stacking them.
  // Done in one transaction: interleaved with another admin inviting the same
  // person, a delete-then-create could otherwise leave two live tokens, and
  // revoking the visible one would leave the other still redeemable.
  const { raw, hash } = createSecureToken();
  const invitation = await prisma.$transaction(async (tx) => {
    await tx.invitation.deleteMany({
      where: { tenantId: ctx.tenant.id, email, acceptedAt: null },
    });
    return tx.invitation.create({
      data: {
        tenantId: ctx.tenant.id,
        email,
        role,
        token: hash,
        expiresAt: invitationExpiry(),
      },
    });
  });

  const inviter = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { name: true, email: true },
  });

  const props = {
    organizationName: headerSafe(ctx.tenant.name, "an organization"),
    roleLabel: ROLE_LABEL[role],
    roleSummary: ROLE_SUMMARY[role],
    inviterName: headerSafe(inviter?.name || inviter?.email || "", "An organizer"),
    inviteUrl: `${appOrigin()}/invite?token=${raw}`,
    expiryDays: Math.round(INVITATION_TTL_HOURS / 24),
  };

  try {
    await sendTemplate({
      to: email,
      subject: `${props.inviterName} invited you to ${props.organizationName}`,
      template: <TeamInvite {...props} />,
      text: teamInviteText(props),
    });
  } catch {
    // The invitation exists but nobody was told. Say so plainly and leave it
    // listed as pending, so the admin can revoke and invite again.
    console.error("Team invitation email failed to send.");
    return {
      error: "The invitation was created but we couldn't send the email. Try inviting again.",
    };
  }

  await recordAudit({
    tenantId: ctx.tenant.id,
    actorUserId: ctx.userId,
    action: "INVITE_MEMBER",
    targetType: "Invitation",
    targetId: invitation.id,
  });

  revalidatePath(`/app/o/${ctx.tenant.slug}/team`);
  return { invitedEmail: email };
}

export async function revokeInvitation(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const invitationId = String(formData.get("invitationId") ?? "");
  const ctx = await requireMembership(tenantSlug, "ADMIN");

  const deleted = await prisma.invitation.deleteMany({
    where: { id: invitationId, tenantId: ctx.tenant.id, acceptedAt: null },
  });
  if (deleted.count === 0) notFound();

  await recordAudit({
    tenantId: ctx.tenant.id,
    actorUserId: ctx.userId,
    action: "REVOKE_INVITATION",
    targetType: "Invitation",
    targetId: invitationId,
  });

  revalidatePath(`/app/o/${ctx.tenant.slug}/team`);
}

export async function removeMember(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const membershipId = String(formData.get("membershipId") ?? "");
  const ctx = await requireMembership(tenantSlug, "ADMIN");

  const applied = await withLastAdminGuard(
    ctx.tenant.id,
    membershipId,
    (role) => role === "ADMIN",
    async (tx, id) => {
      await tx.membership.delete({ where: { id } });
    },
  );

  if (applied) {
    await recordAudit({
      tenantId: ctx.tenant.id,
      actorUserId: ctx.userId,
      action: "REMOVE_MEMBER",
      targetType: "Membership",
      targetId: membershipId,
    });
  }

  // Revalidate either way so a refused change re-renders the current state
  // rather than leaving the page looking as though it worked.
  revalidatePath(`/app/o/${ctx.tenant.slug}/team`);
}

export async function changeRole(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const membershipId = String(formData.get("membershipId") ?? "");
  const requested = String(formData.get("role") ?? "");
  const ctx = await requireMembership(tenantSlug, "ADMIN");

  if (requested !== "ADMIN" && requested !== "STAFF") return;

  const applied = await withLastAdminGuard(
    ctx.tenant.id,
    membershipId,
    // Only demotion can remove an admin.
    (role) => role === "ADMIN" && requested === "STAFF",
    async (tx, id) => {
      await tx.membership.update({ where: { id }, data: { role: requested } });
    },
  );

  if (applied) {
    await recordAudit({
      tenantId: ctx.tenant.id,
      actorUserId: ctx.userId,
      action: "CHANGE_ROLE",
      targetType: "Membership",
      targetId: membershipId,
    });
  }

  revalidatePath(`/app/o/${ctx.tenant.slug}/team`);
}
