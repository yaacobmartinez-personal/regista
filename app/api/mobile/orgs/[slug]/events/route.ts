import { prisma } from "@/lib/db";
import { requireApiMembership } from "@/lib/api-auth";
import { route } from "@/lib/api-response";

/**
 * E3 — an organization's events, with the two headline numbers the app shows on
 * each card.
 *
 * The counts are two grouped queries rather than a count per event: the list is
 * the organizer's home screen, and the database it talks to is a long way from
 * the server (see the region note in docs/MOBILE-API-PLAN.md), so a per-event
 * query would multiply that round trip by the number of events.
 *
 * Erased registrations still count. The row is kept precisely so attendance and
 * capacity figures survive an erasure (see the schema comment on
 * `Registration.anonymizedAt`).
 */
export const GET = route(async (
  request: Request,
  ctx: { params: Promise<{ slug: string }> },
) => {
  const { slug } = await ctx.params;
  const { tenant } = await requireApiMembership(request, slug);

  const [events, confirmedByEvent, checkedInByEvent] = await Promise.all([
    prisma.event.findMany({
      where: { tenantId: tenant.id },
      orderBy: { startsAt: "asc" },
      select: {
        slug: true,
        title: true,
        startsAt: true,
        endsAt: true,
        timezone: true,
        capacity: true,
        status: true,
        id: true,
      },
    }),
    prisma.registration.groupBy({
      by: ["eventId"],
      where: { tenantId: tenant.id, status: "CONFIRMED" },
      _count: { _all: true },
    }),
    prisma.registration.groupBy({
      by: ["eventId"],
      where: { tenantId: tenant.id, checkedInAt: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const confirmed = new Map(confirmedByEvent.map((r) => [r.eventId, r._count._all]));
  const checkedIn = new Map(checkedInByEvent.map((r) => [r.eventId, r._count._all]));

  return Response.json({
    org: { slug: tenant.slug, name: tenant.name },
    events: events.map((event) => ({
      slug: event.slug,
      title: event.title,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt ? event.endsAt.toISOString() : null,
      timezone: event.timezone,
      capacity: event.capacity,
      status: event.status,
      confirmed: confirmed.get(event.id) ?? 0,
      checkedIn: checkedIn.get(event.id) ?? 0,
    })),
  });
});
