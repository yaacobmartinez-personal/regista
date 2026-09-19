import { z } from "zod";
import { resendAccountVerification } from "@/lib/accounts";
import { rateLimit } from "@/lib/rate-limit";
import { readJson, route, tooManyRequests, validationFailed } from "@/lib/api-response";

/**
 * #3 — send the confirmation again.
 *
 * Keyed by address rather than by the cookie the web's resend uses: the app has
 * no session yet at this point, and the address is what the person just typed.
 * Limited per address so the endpoint cannot be used to send someone a stream of
 * mail they did not ask for.
 */

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
});

export const POST = route(async (request: Request) => {
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) throw validationFailed(parsed.error);

  if (!rateLimit(`resend:email:${parsed.data.email}`, 3, 60 * 15).ok) {
    throw tooManyRequests("Please wait a few minutes before requesting another email.");
  }

  await resendAccountVerification(parsed.data.email);

  // Identical whether an account was found, was already confirmed, or the send
  // failed — see lib/accounts.tsx.
  return Response.json({ ok: true });
});
