import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/tokens";

/**
 * Invitation lookup and redemption.
 *
 * Kept out of the action module so server components can read an invitation
 * without that lookup also becoming a callable server action.
 */

export type LiveInvitation = {
  id: string;
  email: string;
  role: Role;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
};

/** An invitation that is unaccepted, unexpired, and belongs to a live tenant. */
export async function findLiveInvitation(
  rawToken: string | undefined,
): Promise<LiveInvitation | null> {
  if (!rawToken) return null;

  const invitation = await prisma.invitation.findUnique({
    where: { token: hashToken(rawToken) },
    include: { tenant: { select: { id: true, name: true, slug: true, status: true } } },
  });

  if (!invitation) return null;
  if (invitation.acceptedAt) return null;
  if (invitation.expiresAt.getTime() <= Date.now()) return null;
  if (invitation.tenant.status !== "ACTIVE") return null;

  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    tenantId: invitation.tenant.id,
    tenantName: invitation.tenant.name,
    tenantSlug: invitation.tenant.slug,
  };
}

/** Create the membership and close the invitation, atomically. */
export async function redeemInvitation(
  invitation: LiveInvitation,
  userId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Claim the invitation first: the conditional update makes a concurrent
    // second redemption a no-op rather than a duplicate membership.
    const claimed = await tx.invitation.updateMany({
      where: { id: invitation.id, acceptedAt: null },
      data: { acceptedAt: new Date() },
    });
    if (claimed.count === 0) return;

    // Accepting an invitation may add someone to an organization, never change
    // what they already are. An outstanding invitation is a stale snapshot: if
    // it could rewrite the role, opening an old STAFF link would quietly demote
    // a sitting admin — and it would do so without the last-admin guard, which
    // only covers the team page.
    await tx.membership.upsert({
      where: { userId_tenantId: { userId, tenantId: invitation.tenantId } },
      update: {},
      create: { userId, tenantId: invitation.tenantId, role: invitation.role },
    });
  });
}

/**
 * Whether the invited address already has an account its owner can sign into.
 *
 * An unverified account doesn't count: nobody has proven control of that
 * address, so it is treated as unclaimed and the invitee sets their own
 * password. Otherwise anyone could register a colleague's address and leave
 * them permanently unable to accept an invitation.
 */
export async function invitedUserHasAccount(email: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { passwordHash: true, emailVerified: true },
  });
  return Boolean(user?.passwordHash && user.emailVerified);
}
