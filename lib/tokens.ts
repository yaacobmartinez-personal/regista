import { randomBytes, createHash } from "node:crypto";

/** Hours a signup verification link stays valid. */
export const VERIFICATION_TTL_HOURS = 24;

/** Hours a team invitation stays valid. Longer, since it waits on a colleague. */
export const INVITATION_TTL_HOURS = 168; // 7 days

/**
 * Generate a URL-safe single-use token.
 *
 * Returns the raw value (emailed to the recipient, never stored) and its
 * SHA-256 hash (stored). A database leak therefore cannot be replayed as a live
 * link. Used for both email verification and team invitations.
 */
export function createSecureToken() {
  const raw = randomBytes(32).toString("base64url"); // 256-bit
  return { raw, hash: hashToken(raw) };
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// A constant-time `tokensMatch` used to live here with no callers. Both token
// flows look the value up by its unique hash rather than comparing digests, so
// it was never on the path — and a security helper that isn't wired up reads as
// a protection that exists when it doesn't.

export function verificationExpiry(): Date {
  return new Date(Date.now() + VERIFICATION_TTL_HOURS * 60 * 60 * 1000);
}

export function invitationExpiry(): Date {
  return new Date(Date.now() + INVITATION_TTL_HOURS * 60 * 60 * 1000);
}
