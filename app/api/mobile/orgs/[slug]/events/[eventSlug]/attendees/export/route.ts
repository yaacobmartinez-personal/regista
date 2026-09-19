import { prisma } from "@/lib/db";
import { requireApiMembership } from "@/lib/api-auth";
import { attendeeCsv } from "@/lib/attendees";
import { recordAudit } from "@/lib/audit";
import { filenameSlug } from "@/lib/csv";
import { notFound, route } from "@/lib/api-response";

/**
 * #27 — download an event's attendee list.
 *
 * The one endpoint here that does not answer JSON. Access is gated by
 * membership and the query scoped to it, so an event slug from another
 * organization cannot be exported, and the export is recorded in the audit log
 * because it moves personal data out of the system.
 *
 * The filename is built from the event's slug, as the contract specifies. The
 * dashboard's download names it from the title instead — usually the same
 * string, since one is derived from the other, but they part company after a
 * rename or a slug collision. Noted in §12 of docs/MOBILE-API-PLAN.md.
 */
export const GET = route(async (
  request: Request,
  ctx: { params: Promise<{ slug: string; eventSlug: string }> },
) => {
  const { slug, eventSlug } = await ctx.params;
  const { tenant, userId } = await requireApiMembership(request, slug);

  const event = await prisma.event.findFirst({
    where: { tenantId: tenant.id, slug: eventSlug },
    select: { id: true, slug: true },
  });
  if (!event) throw notFound("That event no longer exists.");

  const csv = await attendeeCsv(tenant.id, event.id);

  await recordAudit({
    tenantId: tenant.id,
    actorUserId: userId,
    action: "EXPORT_ATTENDEES",
    targetType: "Event",
    targetId: event.id,
  });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filenameSlug(event.slug)}-attendees.csv"`,
      // Personal data: never cache.
      "Cache-Control": "no-store",
    },
  });
});
