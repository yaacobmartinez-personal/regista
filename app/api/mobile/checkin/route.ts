import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiMembership } from "@/lib/api-auth";
import { performCheckIn } from "@/lib/checkin";
import { extractCheckInCode } from "@/lib/urls";
import { isImpossiblyAhead } from "@/lib/checkin-time";
import { badRequest, readJson, route, validationFailed } from "@/lib/api-response";

/**
 * E6 — check someone in from a scanned ticket.
 *
 * Every business answer is a 200 with an `outcome`: a ticket for the wrong
 * event, a cancelled place, or an unrecognised code are all things the door
 * staff need told, not errors the client should retry or report as a failure.
 * Only a bad request, a bad token, or no membership use a status code.
 *
 * `performCheckIn` takes the tenant from the verified session and scopes the
 * lookup to it, so a ticket from another organization resolves to "invalid" with
 * nothing to say whether it exists — and it is idempotent, so the second scan of
 * the same code reports "already" rather than failing.
 *
 * `at` carries the real door time when a scan taken with no signal is replayed.
 * The scanner is the busier of the two offline paths, so without it most of a
 * queued door ends up stamped with the moment the signal came back. Refused when
 * it is further ahead than a clock difference explains; otherwise bounded by the
 * registration's sign-up time and now, inside `performCheckIn`.
 */

const bodySchema = z.object({
  slug: z.string().trim().min(1, "Pick an organization."),
  code: z.string().trim().min(1, "Scan or enter a code."),
  eventSlug: z.string().trim().min(1).optional(),
  at: z
    .string()
    .trim()
    .refine((v) => Number.isFinite(Date.parse(v)), "That isn't a valid timestamp.")
    .optional(),
});

export const POST = route(async (request: Request) => {
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) throw validationFailed(parsed.error);
  const { slug, code, eventSlug, at } = parsed.data;

  // Checked before the tenant lookup so an impossible clock is refused the same
  // way whoever sent it; the lower bound needs the registration and is applied
  // in performCheckIn.
  if (at !== undefined && isImpossiblyAhead(Date.parse(at), Date.now())) {
    throw badRequest("That check-in time is in the future.", {
      fieldErrors: { at: "That check-in time is in the future." },
    });
  }

  const { tenant, userId } = await requireApiMembership(request, slug);

  // Pin the scan to one event when the scanner was opened from that event, so a
  // ticket for a different one reads as "wrong_event" instead of quietly
  // checking someone in somewhere else. An event slug that does not resolve
  // leaves the id undefined, which performCheckIn treats as an unpinned scan.
  const event = eventSlug
    ? await prisma.event.findFirst({
        where: { tenantId: tenant.id, slug: eventSlug },
        select: { id: true },
      })
    : null;

  const result = await performCheckIn(
    { tenantId: tenant.id, userId },
    extractCheckInCode(code),
    {
      ...(event ? { requireEventId: event.id } : {}),
      ...(at !== undefined ? { at: new Date(at) } : {}),
    },
  );

  return Response.json({
    outcome: result.outcome,
    name: result.name ?? null,
    at: result.at ? result.at.toISOString() : null,
    eventTitle: result.eventTitle ?? null,
  });
});
