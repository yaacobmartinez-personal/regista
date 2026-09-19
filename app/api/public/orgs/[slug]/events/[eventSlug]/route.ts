import { resolveActiveTenant } from "@/lib/tenant";
import { publicEvent } from "@/lib/events";
import { notFound, route } from "@/lib/api-response";

/**
 * #12 — one published event, with its description. Unauthenticated.
 *
 * A draft or closed event is 404 here, not a payload with a status field: it is
 * not on offer, and the app has nothing to show for one.
 */
export const GET = route(async (
  _request: Request,
  ctx: { params: Promise<{ slug: string; eventSlug: string }> },
) => {
  const { slug, eventSlug } = await ctx.params;

  const tenant = await resolveActiveTenant(slug);
  if (!tenant) throw notFound("No organization at that address.");

  const event = await publicEvent(tenant.id, eventSlug);
  if (!event) throw notFound("That event isn't available.");

  return Response.json({ org: { slug: tenant.slug, name: tenant.name }, event });
});
