import { requireApiMembership } from "@/lib/api-auth";
import { teamFor } from "@/lib/team";
import { route } from "@/lib/api-response";

/**
 * #28 — who is on the team, and who has been invited.
 *
 * Admins only, like the dashboard page it mirrors: the member list is a list of
 * colleagues' addresses, and staff have no reason to hold it.
 *
 * `adminCount` is sent so the app can grey out the control that would leave the
 * organization with none, rather than offering it and reporting a refusal. The
 * server still refuses it — the count is a courtesy, not the check.
 */
export const GET = route(async (
  request: Request,
  ctx: { params: Promise<{ slug: string }> },
) => {
  const { slug } = await ctx.params;
  const { tenant, userId } = await requireApiMembership(request, slug, "ADMIN");

  return Response.json(await teamFor(tenant.id, userId));
});
