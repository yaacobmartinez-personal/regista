import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireMembership } from "@/lib/authz";
import { recordAudit } from "@/lib/audit";
import { toCsv, filenameSlug } from "@/lib/csv";

/**
 * Download an event's attendee list.
 *
 * Access is gated by membership in the organization, and the query is scoped to
 * it, so an event slug from another organization cannot be exported. The export
 * is recorded in the audit log because it moves personal data out of the system.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; eventSlug: string }> },
) {
  const { slug, eventSlug } = await params;
  const ctx = await requireMembership(slug);

  const event = await prisma.event.findFirst({
    where: { tenantId: ctx.tenant.id, slug: eventSlug },
    select: { id: true, title: true, slug: true },
  });
  if (!event) return new NextResponse("Not found", { status: 404 });

  const registrations = await prisma.registration.findMany({
    where: { tenantId: ctx.tenant.id, eventId: event.id },
    orderBy: { createdAt: "asc" },
  });

  const csv = toCsv(
    ["Name", "Email", "Status", "Checked in", "Registered at"],
    registrations.map((r) => [
      r.anonymizedAt ? "(erased)" : r.name,
      r.anonymizedAt ? "(erased)" : r.email,
      r.status,
      r.checkedInAt ? r.checkedInAt.toISOString() : "",
      r.createdAt.toISOString(),
    ]),
  );

  await recordAudit({
    tenantId: ctx.tenant.id,
    actorUserId: ctx.userId,
    action: "EXPORT_ATTENDEES",
    targetType: "Event",
    targetId: event.id,
  });

  const filename = `${filenameSlug(event.title)}-attendees.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Personal data: never cache.
      "Cache-Control": "no-store",
    },
  });
}
