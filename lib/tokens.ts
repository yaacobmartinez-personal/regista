import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

/** Hours a signup verification link stays valid. */
export const VERIFICATION_TTL_HOURS = 24;

/**
 * Generate a URL-safe verification token.
 *
 * Returns the raw value (emailed to the user, never stored) and its SHA-256
 * hash (stored). A database leak therefore cannot be replayed as a live link.
 */
export function createVerificationToken() {
  const raw = randomBytes(32).toString("base64url"); // 256-bit
  return { raw, hash: hashToken(raw) };
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Constant-time compare for two hex digests of equal length. */
export function tokensMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function verificationExpiry(): Date {
  return new Date(Date.now() + VERIFICATION_TTL_HOURS * 60 * 60 * 1000);
}
