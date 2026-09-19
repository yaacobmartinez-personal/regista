import { z } from "zod";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { identityFromApple, signInWithIdentity, verifyAppleIdentityToken } from "@/lib/social-auth";
import { readJson, route, tooManyRequests, validationFailed } from "@/lib/api-response";

/**
 * #7 — Sign in with Apple from the native SDK (iOS).
 *
 * The identity token's audience is the app's bundle id and it carries the
 * SHA-256 of the nonce the app generated for this attempt; the app sends the
 * raw nonce so we can check the binding. `fullName` is sent by the app because
 * Apple includes the name only on the very first authorization — the app
 * persists it and re-sends it, and we only use it when creating the account.
 *
 * `authorizationCode` is accepted for forward compatibility (token revocation
 * on account deletion needs it) but is not used yet.
 */

const bodySchema = z.object({
  identityToken: z.string().trim().min(1, "Missing Apple token."),
  nonce: z.string().trim().min(1, "Missing nonce."),
  authorizationCode: z.string().trim().optional(),
  fullName: z.string().trim().max(120).optional(),
});

export const POST = route(async (request: Request) => {
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) throw validationFailed(parsed.error);
  const { identityToken, nonce, fullName } = parsed.data;

  const ip = await clientIp();
  if (!rateLimit(`social:ip:${ip}`, 30, 15 * 60).ok) {
    throw tooManyRequests("Too many sign-in attempts. Try again in a few minutes.");
  }

  const payload = await verifyAppleIdentityToken(identityToken, nonce);
  const identity = identityFromApple(payload, fullName?.length ? fullName : null);
  const result = await signInWithIdentity(identity);
  return Response.json(result);
});
