import { requireApiMembership } from "@/lib/api-auth";
import { promoteWaitlisted } from "@/lib/attendees";
import { revalidateAttendeeList, revalidateEventSurfaces } from "@/lib/event-surfaces";
import { route } from "@/lib/api-response";

/**
 * #25 — move one waitlisted person into a confirmed place.
 *
 * Every answer is a 200 with an `outcome`: "full" and "gone" are things the
 * organizer needs told, not failures. "full" is a refusal by design — someone
 * who wants more people in the room raises the capacity, which promotes the
 * queue in order, rather than overriding the stated limit one person at a time.
 *
 * Confirming someone changes the seats left on the public page, so that is
 * refreshed too. (The dashboard's own promote control refreshes only the
 * attendee list — see §12 of docs/MOBILE-API-PLAN.md.)
 */
export const POST = route(async (
  request: Request,
  ctx: { params: Promise<{ slug: string; eventSlug: string; id: string }> },
) => {
  const { slug, eventSlug, id } = await ctx.params;
  const { tenant, userId } = await requireApiMembership(request, slug);

  const outcome = await promoteWaitlisted({ tenantId: tenant.id, userId }, id);

  if (outcome === "promoted") {
    revalidateAttendeeList(tenant.slug, eventSlug);
    revalidateEventSurfaces(tenant.slug, eventSlug);
  }

  return Response.json({ outcome });
});
