import { z } from "zod";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { identityFromGoogle, signInWithIdentity, verifyGoogleIdToken } from "@/lib/social-auth";
import { readJson, route, tooManyRequests, validationFailed } from "@/lib/api-response";

/**
 * #6 — sign in with a Google ID token from the native SDK.
 *
 * The token's audience must be the *web* OAuth client id (GOOGLE_WEB_CLIENT_ID),
 * which is what the Android and iOS SDKs are configured to request tokens
 * for; the platform client ids only gate which apps may ask. Verification,
 * linking and account creation are in lib/social-auth.ts.
 */

const bodySchema = z.object({
  idToken: z.string().trim().min(1, "Missing Google token."),
});

export const POST = route(async (request: Request) => {
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) throw validationFailed(parsed.error);

  const ip = await clientIp();
  if (!rateLimit(`social:ip:${ip}`, 30, 15 * 60).ok) {
    throw tooManyRequests("Too many sign-in attempts. Try again in a few minutes.");
  }

  const payload = await verifyGoogleIdToken(parsed.data.idToken);
  const result = await signInWithIdentity(identityFromGoogle(payload));
  return Response.json(result);
});
