import { requireApiUser } from "@/lib/api-auth";
import { ticketForUser } from "@/lib/registrations";
import { notFound, route } from "@/lib/api-response";

/**
 * #15 — one of this account's places.
 *
 * A place belonging to someone else is 404, the same answer as one that does
 * not exist: whether a given registration id is real is not this caller's
 * business either way.
 */
export const GET = route(async (
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) => {
  const { id } = await ctx.params;
  const user = await requireApiUser(request);

  const ticket = await ticketForUser(user.id, id);
  if (!ticket) throw notFound("That ticket isn't yours, or no longer exists.");

  return Response.json({ ticket });
});
