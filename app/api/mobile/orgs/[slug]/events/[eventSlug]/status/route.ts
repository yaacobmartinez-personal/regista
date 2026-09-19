import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiMembership } from "@/lib/api-auth";
import { revalidateEventSurfaces } from "@/lib/event-surfaces";
import { notFound, readJson, route, validationFailed } from "@/lib/api-response";

/**
 * #21 — publish, unpublish or close an event.
 *
 * Its own endpoint rather than a field on the edit body, so publishing is always
 * a deliberate act and never a side effect of fixing a typo — the same reason
 * the web keeps `setEventStatus` apart from `updateEvent`.
 *
 * The public pages are refreshed because this is the change that most needs it:
 * closing registrations while a cached page still offers a working sign-up form
 * is exactly the failure that refresh exists to prevent.
 */

const bodySchema = z.object({
  status: z.enum(["DRAFT", "PUBLISHED", "CLOSED"], {
    message: "Pick a valid status.",
  }),
});

export const POST = route(async (
  request: Request,
  ctx: { params: Promise<{ slug: string; eventSlug: string }> },
) => {
  const { slug, eventSlug } = await ctx.params;
  const { tenant } = await requireApiMembership(request, slug);

  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) throw validationFailed(parsed.error);

  const updated = await prisma.event.updateMany({
    where: { tenantId: tenant.id, slug: eventSlug },
    data: { status: parsed.data.status },
  });
  if (updated.count === 0) throw notFound("That event no longer exists.");

  revalidateEventSurfaces(tenant.slug, eventSlug);
  return Response.json({ event: { slug: eventSlug, status: parsed.data.status } });
});
