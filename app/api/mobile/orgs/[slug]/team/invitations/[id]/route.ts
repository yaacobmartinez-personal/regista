import { requireApiMembership } from "@/lib/api-auth";
import { revokeTeamInvitation } from "@/lib/team";
import { notFound, route } from "@/lib/api-response";

/**
 * #30 — withdraw an invitation that has not been accepted.
 *
 * An invitation that was already accepted is a membership now, and is removed
 * through #32 instead — so it answers not-found here rather than appearing to
 * undo something it cannot.
 */
export const DELETE = route(async (
  request: Request,
  ctx: { params: Promise<{ slug: string; id: string }> },
) => {
  const { slug, id } = await ctx.params;
  const { tenant, userId } = await requireApiMembership(request, slug, "ADMIN");

  const revoked = await revokeTeamInvitation(
    { tenantId: tenant.id, tenantName: tenant.name, userId },
    id,
  );
  if (!revoked) throw notFound("That invitation is no longer outstanding.");

  return Response.json({ ok: true });
});
