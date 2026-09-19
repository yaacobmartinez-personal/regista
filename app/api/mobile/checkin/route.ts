import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiMembership } from "@/lib/api-auth";
import { performCheckIn } from "@/lib/checkin";
import { extractCheckInCode } from "@/lib/urls";
import { readJson, route, validationFailed } from "@/lib/api-response";

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
 */

const bodySchema = z.object({
  slug: z.string().trim().min(1, "Pick an organization."),
  code: z.string().trim().min(1, "Scan or enter a code."),
  eventSlug: z.string().trim().min(1).optional(),
});

export const POST = route(async (request: Request) => {
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) throw validationFailed(parsed.error);
  const { slug, code, eventSlug } = parsed.data;

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
    event ? { requireEventId: event.id } : {},
  );

  return Response.json({
    outcome: result.outcome,
    name: result.name ?? null,
    at: result.at ? result.at.toISOString() : null,
    eventTitle: result.eventTitle ?? null,
  });
});
