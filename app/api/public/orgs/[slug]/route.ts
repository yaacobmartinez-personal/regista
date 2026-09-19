import { resolveActiveTenant } from "@/lib/tenant";
import { notFound, route } from "@/lib/api-response";

/**
 * #10 — an organization's public identity.
 *
 * Unauthenticated, like the public web pages it mirrors. An organization that
 * has not confirmed its address is 404 rather than "pending": it is not open to
 * the public yet, and saying which unclaimed addresses exist would make them
 * worth squatting.
 */
export const GET = route(async (
  _request: Request,
  ctx: { params: Promise<{ slug: string }> },
) => {
  const { slug } = await ctx.params;

  const tenant = await resolveActiveTenant(slug);
  if (!tenant) throw notFound("No organization at that address.");

  return Response.json({ org: { slug: tenant.slug, name: tenant.name } });
});
