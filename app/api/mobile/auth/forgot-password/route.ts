import { z } from "zod";
import { requestPasswordReset } from "@/lib/accounts";
import { rateLimit } from "@/lib/rate-limit";
import { readJson, route, tooManyRequests, validationFailed } from "@/lib/api-response";

/**
 * #4 — ask for a link to choose a new password.
 *
 * Always `{ok: true}`. Someone who mistypes their address should see the same
 * screen as someone who did not, and the difference between the two is exactly
 * what an attacker would use to find out which addresses have accounts.
 *
 * Limited per address, so this cannot be pointed at somebody's mailbox.
 */

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
});

export const POST = route(async (request: Request) => {
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) throw validationFailed(parsed.error);

  if (!rateLimit(`forgot:email:${parsed.data.email}`, 3, 60 * 15).ok) {
    throw tooManyRequests("Please wait a few minutes before requesting another email.");
  }

  await requestPasswordReset(parsed.data.email);

  return Response.json({ ok: true });
});
