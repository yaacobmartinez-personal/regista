import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiMembership } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import { notFound, readJson, route, validationFailed } from "@/lib/api-response";

/**
 * E5 — mark one attendee present, or undo it, from the attendee list.
 *
 * This is the manual control beside each row; the QR path is E6. It mirrors
 * `toggleCheckIn` in the web's attendees/actions.ts, including matching on
 * (id, tenantId) alone: the event slug in the path addresses the screen the
 * request came from, but the tenant scope is what actually protects the row, so
 * a registration id from another organization cannot be reached even if its
 * event slug is guessed.
 */

const bodySchema = z.object({ checkedIn: z.boolean() });

export const POST = route(async (
  request: Request,
  ctx: { params: Promise<{ slug: string; eventSlug: string; id: string }> },
) => {
  const { slug, id } = await ctx.params;
  const { tenant, userId } = await requireApiMembership(request, slug);

  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) throw validationFailed(parsed.error);

  const checkedInAt = parsed.data.checkedIn ? new Date() : null;

  const updated = await prisma.registration.updateMany({
    where: { id, tenantId: tenant.id },
    data: { checkedInAt },
  });
  if (updated.count === 0) throw notFound("That attendee is no longer on the list.");

  // Check-in asserts that a named person was physically somewhere at a time,
  // which is about the most sensitive thing derived here — so it is recorded
  // like the other personal-data actions.
  await recordAudit({
    tenantId: tenant.id,
    actorUserId: userId,
    action: "CHECK_IN_REGISTRATION",
    targetType: "Registration",
    targetId: id,
  });

  return Response.json({ checkedInAt: checkedInAt ? checkedInAt.toISOString() : null });
});
