import { requireApiUser } from "@/lib/api-auth";
import { isReservedSubdomain, isUsableSlug, slugAvailability } from "@/lib/tenant";
import { badRequest, route } from "@/lib/api-response";

/**
 * #34 — is this address free?
 *
 * The live check behind the address field, answering with the same rules the
 * create call applies, so the form cannot say "available" for something that
 * will then be refused. An abandoned signup's address reads as available and is
 * released at the moment somebody actually claims it.
 *
 * Signed in, because it reads the tenant table by name and there is no reason
 * to let the world enumerate addresses.
 */
export const GET = route(async (request: Request) => {
  await requireApiUser(request);

  const raw = new URL(request.url).searchParams.get("slug");
  if (raw === null) throw badRequest("Pass a slug to check.");

  const slug = raw.trim().toLowerCase();
  if (!slug) return Response.json({ slug, available: false, reason: "invalid" });
  if (isReservedSubdomain(slug)) return Response.json({ slug, available: false, reason: "reserved" });
  if (!isUsableSlug(slug)) return Response.json({ slug, available: false, reason: "invalid" });

  const availability = await slugAvailability(slug);
  return availability.state === "taken"
    ? Response.json({ slug, available: false, reason: "taken" })
    : Response.json({ slug, available: true });
});
