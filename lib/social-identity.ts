import { createHash } from "node:crypto";

/**
 * The pure half of social sign-in: turning a verified provider payload into
 * the identity we key accounts on. No imports beyond node:crypto, so it
 * compiles under the unit tests' tsconfig and Turbopack alike; lib/social-auth.ts
 * does the verifying, the account lookup, and turns a refusal here into the
 * API's error shape.
 */

/** The claims we read; a subset of what jose returns, so no jose import here. */
export type ProviderClaims = Record<string, unknown> & { sub?: string };

export type Provider = "google" | "apple";

export type SocialIdentity = {
  provider: Provider;
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
};

/**
 * Why a payload could not become an identity. `unreadable` is a token we
 * verified but cannot use (401 upstream); `apple_identity_incomplete` is the
 * contract's reason for "Apple withheld the email and we have never seen this
 * sub" (400), which the app turns into the revoke-and-retry remedy.
 */
export type IdentityRefusal =
  | { ok: false; reason: "unreadable"; provider: Provider }
  | { ok: false; reason: "apple_identity_incomplete" };

export type IdentityResult = { ok: true; identity: SocialIdentity } | IdentityRefusal;

export function googleClientId(env: NodeJS.ProcessEnv = process.env): string | null {
  const id = (env.GOOGLE_WEB_CLIENT_ID ?? "").trim();
  return id.length > 0 ? id : null;
}

export function appleBundleId(env: NodeJS.ProcessEnv = process.env): string {
  return (env.APPLE_BUNDLE_ID ?? "pro.thingstead.app").trim();
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** A provider's `email_verified` arrives as a boolean or the string "true". */
export function claimedVerified(v: unknown): boolean {
  return v === true || v === "true";
}

/** Apple signs the SHA-256 of the nonce the app generated; the app sends the raw one. */
export function sha256Hex(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function identityFromGoogle(payload: ProviderClaims): IdentityResult {
  const sub = str(payload.sub);
  const email = str(payload.email)?.toLowerCase() ?? null;
  if (!sub || !email) return { ok: false, reason: "unreadable", provider: "google" };
  return {
    ok: true,
    identity: {
      provider: "google",
      sub,
      email,
      emailVerified: claimedVerified(payload.email_verified),
      name: str(payload.name),
    },
  };
}

export function identityFromApple(payload: ProviderClaims, fullName: string | null): IdentityResult {
  const sub = str(payload.sub);
  const email = str(payload.email)?.toLowerCase() ?? null;
  if (!sub) return { ok: false, reason: "unreadable", provider: "apple" };
  // Apple withholds the email after the first authorization. If we do not
  // already know this sub, the app has to make the person revoke and retry
  // (Settings → Apple ID → Sign in with Apple).
  if (!email) return { ok: false, reason: "apple_identity_incomplete" };
  return {
    ok: true,
    identity: {
      provider: "apple",
      sub,
      email,
      // Relay addresses count as verified; Apple owns them.
      emailVerified: claimedVerified(payload.email_verified),
      name: fullName,
    },
  };
}
