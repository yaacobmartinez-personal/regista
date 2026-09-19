import { prisma } from "@/lib/db";
import { requireApiMembership } from "@/lib/api-auth";
import { notFound, route } from "@/lib/api-response";

/** The app pages at 500; contract item #23 adds a cursor for larger events. */
const MAX_ATTENDEES = 500;

/**
 * E4 — one event's attendee list, with an optional `q` filter.
 *
 * Erased people are still listed — their place still counts — but with no
 * identifying fields. `eraseRegistration` leaves a placeholder address behind to
 * keep the (eventId, email) constraint satisfied, so `email` is nulled here
 * rather than passed through; it is not the person's address and must not look
 * like one. A search skips erased rows entirely, both because there is nothing
 * left to match and so that the placeholder cannot be searched for.
 */
export const GET = route(async (
  request: Request,
  ctx: { params: Promise<{ slug: string; eventSlug: string }> },
) => {
  const { slug, eventSlug } = await ctx.params;
  const { tenant } = await requireApiMembership(request, slug);

  const event = await prisma.event.findFirst({
    where: { tenantId: tenant.id, slug: eventSlug },
    select: { id: true, title: true, timezone: true, capacity: true },
  });
  if (!event) throw notFound("That event no longer exists.");

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";

  const registrations = await prisma.registration.findMany({
    where: {
      tenantId: tenant.id,
      eventId: event.id,
      ...(query
        ? {
            anonymizedAt: null,
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { email: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "asc" },
    take: MAX_ATTENDEES,
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      checkedInAt: true,
      anonymizedAt: true,
    },
  });

  return Response.json({
    event: { title: event.title, timezone: event.timezone, capacity: event.capacity },
    attendees: registrations.map((registration) => {
      const erased = registration.anonymizedAt !== null;
      return {
        id: registration.id,
        name: erased ? null : registration.name,
        email: erased ? null : registration.email,
        status: registration.status,
        checkedInAt: registration.checkedInAt
          ? registration.checkedInAt.toISOString()
          : null,
        erased,
      };
    }),
  });
});
