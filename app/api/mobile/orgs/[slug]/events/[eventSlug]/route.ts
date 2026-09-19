import { prisma } from "@/lib/db";
import { requireApiMembership } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import {
  eventInputSchema,
  loadEventDetail,
  promoteFromWaitlist,
  uniqueEventSlug,
} from "@/lib/events";
import { eventInputFromJson } from "@/lib/event-input";
import { revalidateEventSurfaces } from "@/lib/event-surfaces";
import { badRequest, notFound, readJson, route, validationFailed } from "@/lib/api-response";

/** #18 — one event in full, for the detail screen and to populate an edit form. */
export const GET = route(async (
  request: Request,
  ctx: { params: Promise<{ slug: string; eventSlug: string }> },
) => {
  const { slug, eventSlug } = await ctx.params;
  const { tenant } = await requireApiMembership(request, slug);

  const event = await loadEventDetail(tenant.id, eventSlug);
  if (!event) throw notFound("That event no longer exists.");

  return Response.json({ event });
});

/**
 * #20 — edit an event.
 *
 * Mirrors the web's `updateEvent`, including the two rules that are easy to miss
 * and expensive to get wrong: capacity cannot drop below the number of people
 * already holding a place, and raising it promotes the longest-waiting people in
 * the same transaction. The slug is re-derived, so renaming an event changes its
 * public address — the caller reads the new one off the response rather than
 * assuming it kept the old.
 *
 * Status is not editable here. It moves only through #21, as on the web, so
 * publishing stays a deliberate act rather than a side effect of an edit.
 */
export const PATCH = route(async (
  request: Request,
  ctx: { params: Promise<{ slug: string; eventSlug: string }> },
) => {
  const { slug, eventSlug } = await ctx.params;
  const { tenant } = await requireApiMembership(request, slug);

  const existing = await prisma.event.findFirst({
    where: { tenantId: tenant.id, slug: eventSlug },
    select: { id: true },
  });
  if (!existing) throw notFound("That event no longer exists.");

  const parsed = eventInputSchema.safeParse(eventInputFromJson(await readJson(request)));
  if (!parsed.success) throw validationFailed(parsed.error);
  const data = parsed.data;

  // Capacity below the number of people already holding a place would leave the
  // public page reading "Full" while the dashboard shows more registered than
  // the limit. Refuse it and say what the floor is.
  if (data.capacity !== null) {
    const confirmed = await prisma.registration.count({
      where: { tenantId: tenant.id, eventId: existing.id, status: "CONFIRMED" },
    });
    if (data.capacity < confirmed) {
      const message = `${confirmed} people already have a place, so capacity can't be lower than that.`;
      throw badRequest(message, { fieldErrors: { capacity: message } });
    }
  }

  const nextSlug = await uniqueEventSlug(tenant.id, data.slug || data.title, existing.id);

  await prisma.$transaction(async (tx) => {
    await tx.event.update({
      where: { id: existing.id },
      data: {
        slug: nextSlug,
        title: data.title,
        description: data.description,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        timezone: data.timezone,
        capacity: data.capacity,
        waitlistEnabled: data.waitlistEnabled,
      },
    });

    // If that made room, the people who have been waiting longest get it.
    await promoteFromWaitlist(tx, existing.id);
  });

  const event = await loadEventDetail(tenant.id, nextSlug);
  revalidateEventSurfaces(tenant.slug, nextSlug);
  if (eventSlug !== nextSlug) revalidateEventSurfaces(tenant.slug, eventSlug);
  return Response.json({ event });
});

/**
 * #22 — delete an event. Admins only.
 *
 * This destroys more personal data than anything else in the product: the
 * cascade takes every registration under the event with it. Staff can run an
 * event; only an admin can erase one.
 */
export const DELETE = route(async (
  request: Request,
  ctx: { params: Promise<{ slug: string; eventSlug: string }> },
) => {
  const { slug, eventSlug } = await ctx.params;
  const { tenant, userId } = await requireApiMembership(request, slug, "ADMIN");

  const event = await prisma.event.findFirst({
    where: { tenantId: tenant.id, slug: eventSlug },
    select: { id: true, slug: true, _count: { select: { registrations: true } } },
  });
  if (!event) throw notFound("That event no longer exists.");

  const registrationsDeleted = event._count.registrations;

  // Deleting cascades to every registration, so record it before the rows are
  // gone — including how many people's details went with it. Written first so a
  // failure to log is a failure to delete, not a silent untracked deletion.
  await recordAudit({
    tenantId: tenant.id,
    actorUserId: userId,
    action: "DELETE_EVENT",
    targetType: "Event",
    targetId: `${event.id} (${registrationsDeleted} registrations)`,
  });

  await prisma.event.deleteMany({ where: { id: event.id, tenantId: tenant.id } });

  revalidateEventSurfaces(tenant.slug, event.slug);
  return Response.json({ ok: true, registrationsDeleted });
});
