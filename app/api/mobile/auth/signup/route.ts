import { z } from "zod";
import { signupAccount } from "@/lib/accounts";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { readJson, route, tooManyRequests, validationFailed } from "@/lib/api-response";

/**
 * #1 — create a personal account.
 *
 * Always answers `{ok: true}`, whether the address was free, already taken by a
 * confirmed account, or claimed from an unconfirmed one. The reply goes to
 * whoever typed the address, not to whoever owns it, so any difference between
 * those cases would be a way to test addresses against the user table.
 *
 * The account has no organization. That is new here — web signup has only ever
 * created an account alongside one — and it is what an attendee needs.
 */

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters."),
  name: z.string().trim().min(1, "Tell us your name.").max(120),
});

export const POST = route(async (request: Request) => {
  const ip = await clientIp();
  if (!rateLimit(`signup:${ip}`, 5, 60 * 60).ok) {
    throw tooManyRequests("Too many attempts. Try again in a little while.");
  }

  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) throw validationFailed(parsed.error);

  await signupAccount(parsed.data);

  return Response.json({ ok: true });
});
