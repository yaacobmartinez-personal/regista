import { requireApiMembership } from "@/lib/api-auth";
import { eraseRegistrationData } from "@/lib/attendees";
import { revalidateAttendeeList } from "@/lib/event-surfaces";
import { notFound, route } from "@/lib/api-response";

/**
 * #26 — erase a registrant's personal details (right to erasure).
 *
 * Idempotent: erasing an already-erased row answers `{ok: true}` rather than
 * failing. Someone acting on a request to be forgotten should not be told "no"
 * because it already happened, and a retried call must not look like an error.
 *
 * Only a row that does not exist in this organization is a 404.
 *
 * The public pages are not refreshed: the row keeps its status, so the seats
 * left and the headcount are unchanged by this.
 */
export const POST = route(async (
  request: Request,
  ctx: { params: Promise<{ slug: string; eventSlug: string; id: string }> },
) => {
  const { slug, eventSlug, id } = await ctx.params;
  const { tenant, userId } = await requireApiMembership(request, slug);

  const outcome = await eraseRegistrationData({ tenantId: tenant.id, userId }, id);
  if (outcome === "gone") throw notFound("That attendee is no longer on the list.");

  if (outcome === "erased") revalidateAttendeeList(tenant.slug, eventSlug);

  return Response.json({ ok: true });
});
