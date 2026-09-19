import { requireApiUser } from "@/lib/api-auth";
import { cancelTicket } from "@/lib/registrations";
import { revalidatePath } from "next/cache";
import { registeredEventPath } from "@/lib/register";
import { notFound, route } from "@/lib/api-response";

/**
 * #17 — give up a place.
 *
 * The row survives: cancelling is not erasure, and the organization still needs
 * to know the place was released and by whom. Nobody is promoted automatically —
 * freeing a seat and deciding who takes it are different judgements, and the
 * second belongs to the organizer.
 *
 * "already" and "started" are outcomes, not errors. Only a place that is not
 * this account's is a 404.
 */
export const POST = route(async (
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) => {
  const { id } = await ctx.params;
  const user = await requireApiUser(request);

  const { outcome, ticket } = await cancelTicket(user.id, id);
  if (outcome === "invalid") throw notFound("That ticket isn't yours, or no longer exists.");

  // A freed seat changes the places left on the public page.
  if (outcome === "cancelled" && ticket) {
    revalidatePath(registeredEventPath(ticket.org.slug, ticket.event.slug));
  }

  return Response.json({ outcome });
});
