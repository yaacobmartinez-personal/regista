import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Bearer tokens for the mobile app.
 *
 * The web signs in with a NextAuth cookie that is deliberately host-only for
 * `app.<root>` (see lib/auth.ts), so it can never reach a native client. This
 * is the separate, explicit credential native clients use instead.
 *
 * Format, fixed by the Flutter client (`lib/core/network/token_codec.dart`):
 *
 *     base64url(JSON{sub, ver, exp}) "." base64url(HMAC-SHA256(payload))
 *
 * The app base64url-decodes the first segment to read `sub` and `exp`; it never
 * verifies the signature and never trusts `exp` for authorization. The server is
 * the only authority, and it re-reads membership and role from the database on
 * every request, exactly as lib/authz.ts already does for the web.
 *
 * Like NextAuth's JWT strategy, this carries identity only — never a role.
 */

/** Thirty days, per docs/API-CONTRACT.md. There is no refresh endpoint: the app
 *  signs out on a 401 and the person signs in again. */
export const TOKEN_TTL_DAYS = 30;

const TTL_MS = TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

export type MobileTokenPayload = {
  /** User id. */
  sub: string;
  /** The user's `tokenVersion` when the token was minted (see verifyToken). */
  ver: number;
  /**
   * Expiry in **milliseconds** since the epoch — not the seconds a JWT `exp`
   * would carry. `token_codec.dart` reads it with
   * `DateTime.fromMillisecondsSinceEpoch`, so seconds would decode as 1970, the
   * app would treat every token as already expired, and it would never send one.
   */
  exp: number;
};

/**
 * Signing key. Shared with NextAuth: one secret to provision, and rotating it
 * is a deliberate "sign everybody out" either way.
 */
function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) {
    throw new Error("AUTH_SECRET is not set — mobile tokens cannot be signed.");
  }
  return value;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/**
 * Issue a token for a user.
 *
 * `tokenVersion` is read from the User row by the caller and baked in, so the
 * account can revoke every token it has ever issued by raising that number.
 */
export function mintToken(userId: string, tokenVersion: number): string {
  const payload: MobileTokenPayload = {
    sub: userId,
    ver: tokenVersion,
    exp: Date.now() + TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

/**
 * Check a token's signature and expiry.
 *
 * Returns the payload, or null for anything unusable — a bad signature, a
 * malformed body, or an expired token are all just "not signed in". The caller
 * still has to confirm the user exists and that `ver` is current; this function
 * knows nothing about the database.
 */
export function verifyToken(raw: string | null | undefined): MobileTokenPayload | null {
  if (!raw) return null;

  const dot = raw.indexOf(".");
  if (dot < 1 || dot === raw.length - 1) return null;

  const encoded = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);

  // Compare in constant time so a caller cannot search for a valid signature a
  // byte at a time. timingSafeEqual throws on a length mismatch, and the lengths
  // are not secret, so that case is rejected up front.
  const expected = Buffer.from(sign(encoded));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length) return null;
  if (!timingSafeEqual(expected, actual)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const { sub, ver, exp } = parsed as Record<string, unknown>;
  if (typeof sub !== "string" || sub.length === 0) return null;
  if (typeof ver !== "number" || !Number.isInteger(ver)) return null;
  if (typeof exp !== "number" || !Number.isFinite(exp)) return null;
  if (exp <= Date.now()) return null;

  return { sub, ver, exp };
}

/** Pull the credential out of `Authorization: Bearer <token>`. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const [scheme, ...rest] = header.split(" ");
  if (scheme.toLowerCase() !== "bearer") return null;
  const token = rest.join(" ").trim();
  return token.length > 0 ? token : null;
}
