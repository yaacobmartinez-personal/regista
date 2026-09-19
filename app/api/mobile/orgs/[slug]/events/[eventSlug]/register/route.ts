import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { registerForEvent, registeredEventPath } from "@/lib/register";
import { ticketById } from "@/lib/registrations";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { revalidatePath } from "next/cache";
import { readJson, route, tooManyRequests, validationFailed } from "@/lib/api-response";

/**
 * #13 — take a place at a published event, as a signed-in account.
 *
 * The address is the account's, never the request's: a signed-in person can
 * only register themselves, so there is no way to take a place in someone
 * else's name or to use this to find out whether an address is registered.
 * `registerForEvent` is the same code the public web form runs, so the capacity
 * lock and the waitlist behave identically whichever way someone signed up.
 *
 * Every answer here is a 200 with an `outcome` — full, duplicate and closed are
 * things an attendee needs told, not failures — except a body that will not
 * parse, a contended transaction, or too many attempts.
 */

const bodySchema = z.object({
  name: z.string().trim().min(1, "Tell us your name.").max(120),
});

export const POST = route(async (
  request: Request,
  ctx: { params: Promise<{ slug: string; eventSlug: string }> },
) => {
  const { slug, eventSlug } = await ctx.params;
  const user = await requireApiUser(request);

  // The same bucket and limit the web form uses, so one person cannot get a
  // second allowance by switching to the app.
  const ip = await clientIp();
  if (!rateLimit(`register:${ip}`, 20, 60 * 60).ok) {
    throw tooManyRequests("Too many sign-ups from this connection. Try again shortly.");
  }

  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) throw validationFailed(parsed.error);

  const result = await registerForEvent({
    tenantSlug: slug,
    eventSlug,
    name: parsed.data.name,
    email: user.email,
    userId: user.id,
  });

  // Contention on the event's row lock, not an outcome — asking again is the
  // right thing for the app to do, and 429 is what it retries.
  if (result.error) throw tooManyRequests(result.error);

  if (result.outcome === "confirmed" || result.outcome === "waitlisted") {
    revalidatePath(registeredEventPath(slug, eventSlug));
  }

  const ticket = result.registrationId ? await ticketById(result.registrationId) : null;

  return Response.json({ outcome: result.outcome, ...(ticket ? { ticket } : {}) });
});
