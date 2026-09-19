import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiMembership } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import { resolveDoorTime } from "@/lib/checkin-time";
import { badRequest, notFound, readJson, route, validationFailed } from "@/lib/api-response";

/**
 * E5 — mark one attendee present, or undo it, from the attendee list.
 *
 * This is the manual control beside each row; the QR path is E6. It mirrors
 * `toggleCheckIn` in the web's attendees/actions.ts, including matching on
 * (id, tenantId) alone: the event slug in the path addresses the screen the
 * request came from, but the tenant scope is what actually protects the row, so
 * a registration id from another organization cannot be reached even if its
 * event slug is guessed.
 *
 * `at` carries the real door time when the app replays a check-in it took while
 * offline. Without it a queue drained an hour later records the whole door as
 * having arrived at once, which is wrong in the only record anyone has of who
 * was where and when.
 */

const bodySchema = z.object({
  checkedIn: z.boolean(),
  at: z
    .string()
    .trim()
    .refine((v) => Number.isFinite(Date.parse(v)), "That isn't a valid timestamp.")
    .optional(),
});

export const POST = route(async (
  request: Request,
  ctx: { params: Promise<{ slug: string; eventSlug: string; id: string }> },
) => {
  const { slug, id } = await ctx.params;
  const { tenant, userId } = await requireApiMembership(request, slug);

  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) throw validationFailed(parsed.error);
  const { checkedIn, at } = parsed.data;

  // Clearing a check-in has no time to record, so `at` is ignored rather than
  // rejected — a replayed "undo" legitimately carries the queue's timestamp.
  if (!checkedIn) {
    const cleared = await prisma.registration.updateMany({
      where: { id, tenantId: tenant.id },
      data: { checkedInAt: null },
    });
    if (cleared.count === 0) throw notFound("That attendee is no longer on the list.");
    await recordCheckIn(tenant.id, userId, id);
    return Response.json({ checkedInAt: null });
  }

  // The common case is a tap in a connected app, which sends no `at`. That path
  // stays one round trip; only a replay pays for the read that bounds the
  // timestamp, and the door is not waiting on a replay.
  if (at === undefined) {
    // One instant, stored and returned. The app writes what comes back into its
    // cache, so a second `new Date()` here would leave the two disagreeing.
    const checkedInAt = new Date();
    const updated = await prisma.registration.updateMany({
      where: { id, tenantId: tenant.id },
      data: { checkedInAt },
    });
    if (updated.count === 0) throw notFound("That attendee is no longer on the list.");
    await recordCheckIn(tenant.id, userId, id);
    return Response.json({ checkedInAt: checkedInAt.toISOString() });
  }

  const registration = await prisma.registration.findFirst({
    where: { id, tenantId: tenant.id },
    select: { id: true, createdAt: true },
  });
  if (!registration) throw notFound("That attendee is no longer on the list.");

  const resolved = resolveDoorTime(Date.parse(at), {
    createdAtMs: registration.createdAt.getTime(),
    nowMs: Date.now(),
  });
  if (!resolved.ok) {
    throw badRequest("That check-in time is in the future.", {
      fieldErrors: { at: "That check-in time is in the future." },
    });
  }
  const checkedInAt = new Date(resolved.atMs);

  await prisma.registration.update({
    where: { id: registration.id },
    data: { checkedInAt },
  });
  await recordCheckIn(tenant.id, userId, registration.id);

  return Response.json({ checkedInAt: checkedInAt.toISOString() });
});

/**
 * Check-in asserts that a named person was physically somewhere at a time,
 * which is about the most sensitive thing derived here — so it is recorded like
 * the other personal-data actions, whenever it happened and however it arrived.
 */
function recordCheckIn(tenantId: string, actorUserId: string, registrationId: string) {
  return recordAudit({
    tenantId,
    actorUserId,
    action: "CHECK_IN_REGISTRATION",
    targetType: "Registration",
    targetId: registrationId,
  });
}
