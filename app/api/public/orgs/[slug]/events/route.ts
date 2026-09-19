import { resolveActiveTenant } from "@/lib/tenant";
import { publicEvents } from "@/lib/events";
import { notFound, route } from "@/lib/api-response";

/** #11 — an organization's published events, soonest first. Unauthenticated. */
export const GET = route(async (
  _request: Request,
  ctx: { params: Promise<{ slug: string }> },
) => {
  const { slug } = await ctx.params;

  const tenant = await resolveActiveTenant(slug);
  if (!tenant) throw notFound("No organization at that address.");

  return Response.json({
    org: { slug: tenant.slug, name: tenant.name },
    events: await publicEvents(tenant.id),
  });
});
