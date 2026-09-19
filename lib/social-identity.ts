import { createHash } from "node:crypto";
import { badRequest, unauthorized } from "./api-response.js";

/** The claims we read; a subset of what jose returns, so no jose import here. */
export type ProviderClaims = Record<string, unknown> & { sub?: string };

/**
 * The pure half of social sign-in: turning a verified provider payload into
 * the identity we key accounts on. Kept free of database and network imports
 * so it runs under the unit tests; lib/social-auth.ts does the verifying and
 * the account lookup.
 */

export type Provider = "google" | "apple";

export type SocialIdentity = {
  provider: Provider;
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
};

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

export function identityFromGoogle(payload: ProviderClaims): SocialIdentity {
  const sub = str(payload.sub);
  const email = str(payload.email)?.toLowerCase() ?? null;
  if (!sub || !email) throw unauthorized("That Google sign-in could not be read.");
  return {
    provider: "google",
    sub,
    email,
    emailVerified: claimedVerified(payload.email_verified),
    name: str(payload.name),
  };
}

export function identityFromApple(payload: ProviderClaims, fullName: string | null): SocialIdentity {
  const sub = str(payload.sub);
  const email = str(payload.email)?.toLowerCase() ?? null;
  if (!sub) throw unauthorized("That Apple sign-in could not be read.");
  if (!email) {
    // Apple withholds the email after the first authorization. If we do not
    // already know this sub, the app has to make the person revoke and retry
    // (Settings → Apple ID → Sign in with Apple), which the contract signals
    // with this reason so the app can show the exact remedy.
    throw badRequest("Apple did not share an email address.", { reason: "apple_identity_incomplete" });
  }
  return {
    provider: "apple",
    sub,
    email,
    // Relay addresses count as verified; Apple owns them.
    emailVerified: claimedVerified(payload.email_verified),
    name: fullName,
  };
}
