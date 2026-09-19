"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Role } from "@prisma/client";
import { requireMembership } from "@/lib/authz";
import {
  changeMemberRole,
  inviteToTeam,
  removeTeamMember,
  revokeTeamInvitation,
} from "@/lib/team";
import { rateLimit } from "@/lib/rate-limit";
import type { InviteState } from "./shared";

/**
 * Team management. Every action requires ADMIN in the tenant being changed.
 *
 * The work itself lives in lib/team.tsx, shared with the mobile API so the
 * last-admin guard and the invitation rules have one implementation. This is
 * the dashboard's half: its rate limits, its form parsing, and the page
 * refreshes.
 */

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  // Taken from the schema rather than restated, so adding a role is a compile
  // error at the places that need updating instead of a silent rejection here.
  role: z.enum(Role),
});

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

  const result = await inviteToTeam(
    { tenantId: ctx.tenant.id, tenantName: ctx.tenant.name, userId: ctx.userId },
    parsed.data,
  );

  if (result.outcome === "already_member") {
    return { alreadyMember: true, invitedEmail: parsed.data.email };
  }
  if (result.outcome === "email_failed") {
    return {
      error: "The invitation was created but we couldn't send the email. Try inviting again.",
    };
  }

  revalidatePath(`/app/o/${ctx.tenant.slug}/team`);
  return { invitedEmail: parsed.data.email };
}

export async function revokeInvitation(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const invitationId = String(formData.get("invitationId") ?? "");
  const ctx = await requireMembership(tenantSlug, "ADMIN");

  const revoked = await revokeTeamInvitation(
    { tenantId: ctx.tenant.id, tenantName: ctx.tenant.name, userId: ctx.userId },
    invitationId,
  );
  if (!revoked) notFound();

  revalidatePath(`/app/o/${ctx.tenant.slug}/team`);
}

export async function removeMember(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const membershipId = String(formData.get("membershipId") ?? "");
  const ctx = await requireMembership(tenantSlug, "ADMIN");

  await removeTeamMember(
    { tenantId: ctx.tenant.id, tenantName: ctx.tenant.name, userId: ctx.userId },
    membershipId,
  );

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

  await changeMemberRole(
    { tenantId: ctx.tenant.id, tenantName: ctx.tenant.name, userId: ctx.userId },
    membershipId,
    requested,
  );

  revalidatePath(`/app/o/${ctx.tenant.slug}/team`);
}
