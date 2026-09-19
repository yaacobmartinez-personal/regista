import { requireApiUser } from "@/lib/api-auth";
import { ticketsForUser } from "@/lib/registrations";
import { route } from "@/lib/api-response";

/** #14 — every place this account holds, newest first. */
export const GET = route(async (request: Request) => {
  const user = await requireApiUser(request);
  return Response.json({ tickets: await ticketsForUser(user.id) });
});
