import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { prisma } from "@/lib/db";
import { mintToken } from "@/lib/mobile-auth";
import { badRequest, forbidden, unauthorized } from "@/lib/api-response";
import {
  appleBundleId,
  googleClientId,
  identityFromApple as readApple,
  identityFromGoogle as readGoogle,
  sha256Hex,
  type IdentityResult,
  type ProviderClaims,
  type SocialIdentity,
} from "@/lib/social-identity";

export type { Provider, SocialIdentity } from "@/lib/social-identity";

/** A refusal from the pure layer, as the API reports it. */
function unwrap(result: IdentityResult): SocialIdentity {
  if (result.ok) return result.identity;
  if (result.reason === "apple_identity_incomplete") {
    throw badRequest("Apple did not share an email address.", { reason: "apple_identity_incomplete" });
  }
  const who = result.provider === "google" ? "Google" : "Apple";
  throw unauthorized(`That ${who} sign-in could not be read.`);
}

export const identityFromGoogle = (payload: ProviderClaims): SocialIdentity => unwrap(readGoogle(payload));
export const identityFromApple = (payload: ProviderClaims, fullName: string | null): SocialIdentity =>
  unwrap(readApple(payload, fullName));

/**
 * Google and Apple sign-in for the app (API-CONTRACT #6, #7).
 *
 * The app does the native OAuth dance and hands us an identity token. We
 * verify it against the provider's published keys, then find or create the
 * account the same way for both:
 *
 * 1. by the provider's stable subject id, if we have seen it before;
 * 2. else by verified email — this is how someone who signed up with a
 *    password later taps "Continue with Google" and lands in the same
 *    account, and why the email must be verified by the provider first;
 * 3. else a new, already-verified attendee account. Nothing to confirm: the
 *    provider has already proven they own the address.
 *
 * Apple only sends the name on the *first* authorization and may send a
 * private relay address, so both are taken from the request body when the
 * token lacks them, and the sub — never the email — is what we key on later.
 *
 * Both providers' keys are fetched through jose's remote JWK set, which caches
 * and refreshes on an unknown `kid`, so a key rotation is a cache miss rather
 * than an outage.
 */

const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const APPLE_JWKS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

export async function verifyGoogleIdToken(idToken: string): Promise<JWTPayload> {
  const audience = googleClientId();
  if (!audience) throw unauthorized("Google sign-in is not set up on this server.");
  try {
    const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience,
    });
    return payload;
  } catch {
    throw unauthorized("That Google sign-in is not valid.");
  }
}

export async function verifyAppleIdentityToken(identityToken: string, rawNonce: string): Promise<JWTPayload> {
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(identityToken, APPLE_JWKS, {
      issuer: "https://appleid.apple.com",
      audience: appleBundleId(),
    }));
  } catch {
    throw unauthorized("That Apple sign-in is not valid.");
  }
  // The token binds the nonce the app generated for this attempt, so a token
  // captured from one sign-in cannot be replayed into another.
  if (payload.nonce !== sha256Hex(rawNonce)) throw unauthorized("That Apple sign-in is not valid.");
  return payload;
}

/**
 * Find or create the account for a verified identity and mint its token.
 * Returns what E1 returns, plus whether the account is new.
 */
export async function signInWithIdentity(identity: SocialIdentity) {
  // 1. Seen this subject before.
  let user =
    identity.provider === "google"
      ? await prisma.user.findUnique({ where: { googleSub: identity.sub } })
      : await prisma.user.findUnique({ where: { appleSub: identity.sub } });
  let isNewUser = false;

  if (!user) {
    // 2. Same verified address as an existing account: link them. An
    //    unverified provider email is not proof of anything, so it cannot
    //    attach to an account someone else may own.
    if (!identity.emailVerified) {
      throw forbidden("Verify that email address with the provider first.");
    }
    const subData = identity.provider === "google" ? { googleSub: identity.sub } : { appleSub: identity.sub };
    const byEmail = await prisma.user.findUnique({ where: { email: identity.email } });
    if (byEmail) {
      user = await prisma.user.update({
        where: { id: byEmail.id },
        data: {
          ...subData,
          // The provider has proven ownership even if our own email never went out.
          emailVerified: byEmail.emailVerified ?? new Date(),
          name: byEmail.name ?? identity.name,
        },
      });
    } else {
      // 3. Brand new attendee, verified from the start.
      user = await prisma.user.create({
        data: {
          email: identity.email,
          name: identity.name,
          emailVerified: new Date(),
          ...subData,
        },
      });
      isNewUser = true;
    }
  }

  return {
    token: mintToken(user.id, user.tokenVersion),
    user: { id: user.id, email: user.email, name: user.name },
    isNewUser,
  };
}
