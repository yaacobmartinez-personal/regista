import { Role, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ROLE_LABEL, ROLE_SUMMARY } from "@/lib/authz";
import { recordAudit } from "@/lib/audit";
import { sendTemplate } from "@/lib/email";
import { appOrigin } from "@/lib/urls";
import { createSecureToken, invitationExpiry, INVITATION_TTL_HOURS } from "@/lib/tokens";
import { TeamInvite, teamInviteText } from "@/emails/team-invite";

/**
 * Team management, shared by the dashboard and the mobile API.
 *
 * Every function takes the acting admin's verified context and matches rows on
 * (id, tenantId), so an id from another organization never resolves. Nothing
 * here knows about forms, redirects or cache revalidation — each caller does
 * its own.
 */

export type ActingAdmin = { tenantId: string; tenantName: string; userId: string };

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

export type GuardOutcome =
  | "applied"
  /** Refused: it would have left the organization with no admin. */
  | "last_admin"
  /** No such membership in this organization. */
  | "gone";

/**
 * Apply a change to a membership only if it leaves at least one admin.
 *
 * The count and the write happen in one transaction, behind a row lock on the
 * tenant's admin memberships. Counting outside the transaction was a race: two
 * admins acting at the same moment both saw two admins, both passed the guard,
 * and the organization ended up with none — with no way back in, since the team
 * page itself requires an admin.
 *
 * "Refused" and "no such membership" are separate answers because the API has
 * to tell them apart; the dashboard treats both as "nothing changed".
 */
export async function withLastAdminGuard(
  tenantId: string,
  membershipId: string,
  isRemovingAdmin: (currentRole: Role) => boolean,
  apply: (tx: Prisma.TransactionClient, membershipId: string) => Promise<void>,
): Promise<GuardOutcome> {
  return prisma.$transaction(async (tx) => {
    const membership = await tx.membership.findFirst({
      where: { id: membershipId, tenantId },
      select: { id: true, role: true },
    });
    if (!membership) return "gone" as const;

    if (isRemovingAdmin(membership.role)) {
      // Serialise against other admin changes in this tenant.
      await tx.$queryRaw`SELECT id FROM "Membership" WHERE "tenantId" = ${tenantId} AND role = 'ADMIN' FOR UPDATE`;
      const admins = await tx.membership.count({
        where: { tenantId, role: "ADMIN" },
      });
      if (admins <= 1) return "last_admin" as const;
    }

    await apply(tx, membership.id);
    return "applied" as const;
  });
}

/** The team as the dashboard and the app both show it (#28). */
export async function teamFor(tenantId: string, viewerUserId: string) {
  const [memberships, invitations, adminCount] = await Promise.all([
    prisma.membership.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.invitation.findMany({
      where: { tenantId, acceptedAt: null },
      orderBy: { createdAt: "desc" },
    }),
    prisma.membership.count({ where: { tenantId, role: "ADMIN" } }),
  ]);

  const now = Date.now();
  return {
    members: memberships.map((m) => ({
      id: m.id,
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      isSelf: m.user.id === viewerUserId,
      joinedAt: m.createdAt.toISOString(),
    })),
    invitations: invitations.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      expiresAt: i.expiresAt.toISOString(),
      // Kept listed once expired so an admin can see it lapsed and re-send,
      // rather than it silently vanishing.
      expired: i.expiresAt.getTime() <= now,
    })),
    adminCount,
  };
}

export type InvitedRow = {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
  expired: boolean;
};

export type InviteResult =
  | { outcome: "already_member" }
  | { outcome: "invited"; invitation: InvitedRow }
  /** The row exists but nobody was told: the caller must say so. */
  | { outcome: "email_failed"; invitation: InvitedRow };

/** Invite someone to the team, replacing any outstanding invitation (#29). */
export async function inviteToTeam(
  acting: ActingAdmin,
  input: { email: string; role: Role },
): Promise<InviteResult> {
  const { email, role } = input;

  // Saying "already on the team" is not a disclosure: an admin can see the
  // member list anyway.
  const existingMember = await prisma.membership.findFirst({
    where: { tenantId: acting.tenantId, user: { email } },
    select: { id: true },
  });
  if (existingMember) return { outcome: "already_member" };

  // Re-inviting replaces any outstanding invitation rather than stacking them.
  // Done in one transaction: interleaved with another admin inviting the same
  // person, a delete-then-create could otherwise leave two live tokens, and
  // revoking the visible one would leave the other still redeemable.
  const { raw, hash } = createSecureToken();
  const invitation = await prisma.$transaction(async (tx) => {
    await tx.invitation.deleteMany({
      where: { tenantId: acting.tenantId, email, acceptedAt: null },
    });
    return tx.invitation.create({
      data: {
        tenantId: acting.tenantId,
        email,
        role,
        token: hash,
        expiresAt: invitationExpiry(),
      },
    });
  });

  const row: InvitedRow = {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    expiresAt: invitation.expiresAt.toISOString(),
    expired: false,
  };

  const inviter = await prisma.user.findUnique({
    where: { id: acting.userId },
    select: { name: true, email: true },
  });

  const props = {
    organizationName: headerSafe(acting.tenantName, "an organization"),
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
    return { outcome: "email_failed", invitation: row };
  }

  await recordAudit({
    tenantId: acting.tenantId,
    actorUserId: acting.userId,
    action: "INVITE_MEMBER",
    targetType: "Invitation",
    targetId: invitation.id,
  });

  return { outcome: "invited", invitation: row };
}

/** Withdraw an invitation that has not been accepted (#30). */
export async function revokeTeamInvitation(
  acting: ActingAdmin,
  invitationId: string,
): Promise<boolean> {
  const deleted = await prisma.invitation.deleteMany({
    where: { id: invitationId, tenantId: acting.tenantId, acceptedAt: null },
  });
  if (deleted.count === 0) return false;

  await recordAudit({
    tenantId: acting.tenantId,
    actorUserId: acting.userId,
    action: "REVOKE_INVITATION",
    targetType: "Invitation",
    targetId: invitationId,
  });
  return true;
}

/** Promote or demote a member (#31). */
export async function changeMemberRole(
  acting: ActingAdmin,
  membershipId: string,
  role: Role,
): Promise<GuardOutcome> {
  const outcome = await withLastAdminGuard(
    acting.tenantId,
    membershipId,
    // Only demotion can remove an admin.
    (current) => current === "ADMIN" && role === "STAFF",
    async (tx, id) => {
      await tx.membership.update({ where: { id }, data: { role } });
    },
  );

  if (outcome === "applied") {
    await recordAudit({
      tenantId: acting.tenantId,
      actorUserId: acting.userId,
      action: "CHANGE_ROLE",
      targetType: "Membership",
      targetId: membershipId,
    });
  }
  return outcome;
}

/** Remove a member, or leave the organization when it is your own row (#32). */
export async function removeTeamMember(
  acting: ActingAdmin,
  membershipId: string,
): Promise<GuardOutcome> {
  const outcome = await withLastAdminGuard(
    acting.tenantId,
    membershipId,
    (current) => current === "ADMIN",
    async (tx, id) => {
      await tx.membership.delete({ where: { id } });
    },
  );

  if (outcome === "applied") {
    await recordAudit({
      tenantId: acting.tenantId,
      actorUserId: acting.userId,
      action: "REMOVE_MEMBER",
      targetType: "Membership",
      targetId: membershipId,
    });
  }
  return outcome;
}
