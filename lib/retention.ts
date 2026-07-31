import { prisma } from "@/lib/db";

/**
 * Retention housekeeping.
 *
 * Verification tokens and invitations both store an email address, and neither
 * was ever deleted — a spent token from a signup two years ago kept that address
 * indefinitely, for no purpose. Anything past its usefulness is removed here.
 *
 * Deliberately not a background job: there is no scheduler in this deployment,
 * so this runs opportunistically from the signup path and can also be invoked
 * directly (`pnpm db:prune`). Both routes call the same function.
 */

/** How long a spent or expired token is kept before removal. */
const TOKEN_GRACE_DAYS = 7;

export type PruneResult = {
  verificationTokens: number;
  invitations: number;
};

export async function pruneExpiredRecords(): Promise<PruneResult> {
  const cutoff = new Date(Date.now() - TOKEN_GRACE_DAYS * 24 * 60 * 60 * 1000);

  // Spent or long-expired verification tokens. The grace period means a person
  // who clicks an old link still gets "already verified" rather than a blank
  // "invalid" for a while.
  const tokens = await prisma.verificationToken.deleteMany({
    where: {
      OR: [{ usedAt: { lt: cutoff } }, { expiresAt: { lt: cutoff } }],
    },
  });

  // Accepted invitations have done their job; expired ones can't be redeemed.
  // The membership they created is the lasting record, and it doesn't need the
  // invitee's address stored a second time.
  const invitations = await prisma.invitation.deleteMany({
    where: {
      OR: [{ acceptedAt: { lt: cutoff } }, { expiresAt: { lt: cutoff } }],
    },
  });

  return {
    verificationTokens: tokens.count,
    invitations: invitations.count,
  };
}

/**
 * Fire-and-forget prune, for calling from a request path.
 *
 * Never lets a housekeeping failure affect the thing the user was actually
 * doing.
 */
export function pruneInBackground(): void {
  void pruneExpiredRecords().catch((error) => {
    console.error("Retention prune failed:", error);
  });
}
