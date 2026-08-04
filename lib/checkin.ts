import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";

/**
 * Check-in by QR ticket.
 *
 * The token identifies a registration; it does not authorise anything on its own.
 * Marking someone present is always done by a signed-in staff member, and every
 * lookup here is scoped to that member's tenant — an id from another organization
 * simply does not resolve, with no hint that it exists.
 */

export type CheckInView = {
  registrationId: string;
  name: string | null;
  status: "CONFIRMED" | "WAITLIST" | "CANCELLED";
  checkedInAt: Date | null;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  eventId: string;
  eventSlug: string;
  eventTitle: string;
};

/**
 * Resolve a ticket token to its registration — read-only. Used to render the
 * confirmation card before anyone is marked present, so a link opened by a
 * prefetcher changes nothing.
 */
export async function inspectCheckIn(
  rawToken: string | undefined,
): Promise<CheckInView | null> {
  if (!rawToken) return null;

  const r = await prisma.registration.findUnique({
    where: { checkInToken: rawToken },
    select: {
      id: true,
      name: true,
      status: true,
      checkedInAt: true,
      anonymizedAt: true,
      tenant: { select: { id: true, slug: true, name: true, status: true } },
      event: { select: { id: true, slug: true, title: true } },
    },
  });

  if (!r || r.anonymizedAt) return null;
  if (r.tenant.status !== "ACTIVE") return null;

  return {
    registrationId: r.id,
    name: r.name,
    status: r.status,
    checkedInAt: r.checkedInAt,
    tenantId: r.tenant.id,
    tenantSlug: r.tenant.slug,
    tenantName: r.tenant.name,
    eventId: r.event.id,
    eventSlug: r.event.slug,
    eventTitle: r.event.title,
  };
}

export type CheckInOutcome =
  | "checked_in" // just marked present
  | "already" // was already present
  | "cancelled" // gave up their place — staff decides whether to admit
  | "waitlist" // not a confirmed place
  | "wrong_event" // valid ticket, but for a different event
  | "invalid"; // not recognised in this tenant

export type CheckInResult = {
  outcome: CheckInOutcome;
  name?: string | null;
  at?: Date | null;
  eventTitle?: string;
};

/**
 * Mark an attendee present from their ticket, on behalf of a staff member.
 *
 * `acting` is the scanning staff member, taken from their verified session —
 * never from the request — so a ticket only ever resolves inside the organization
 * doing the scanning, and the door action is attributed to a real person.
 * `requireEventId` pins it to one event when the scanner is opened from that
 * event, turning a stray ticket into a clear "wrong event" rather than a silent
 * check-in elsewhere.
 *
 * Idempotent: scanning the same code twice reports "already", it does not error.
 */
export async function performCheckIn(
  acting: { tenantId: string; userId: string },
  rawToken: string,
  opts: { requireEventId?: string } = {},
): Promise<CheckInResult> {
  const view = await inspectCheckIn(rawToken);
  if (!view || view.tenantId !== acting.tenantId) return { outcome: "invalid" };

  if (opts.requireEventId && view.eventId !== opts.requireEventId) {
    return { outcome: "wrong_event", name: view.name, eventTitle: view.eventTitle };
  }
  if (view.status === "CANCELLED") return { outcome: "cancelled", name: view.name };
  if (view.status === "WAITLIST") return { outcome: "waitlist", name: view.name };
  if (view.checkedInAt) {
    return { outcome: "already", name: view.name, at: view.checkedInAt };
  }

  const now = new Date();
  // Conditional on still being un-checked-in, so two scanners racing the same
  // ticket produce exactly one "checked_in" and one "already".
  const changed = await prisma.registration.updateMany({
    where: { id: view.registrationId, checkedInAt: null },
    data: { checkedInAt: now },
  });
  if (changed.count === 0) {
    const fresh = await inspectCheckIn(rawToken);
    return { outcome: "already", name: view.name, at: fresh?.checkedInAt ?? now };
  }

  await recordAudit({
    tenantId: view.tenantId,
    actorUserId: acting.userId,
    action: "CHECK_IN_REGISTRATION",
    targetType: "Registration",
    targetId: view.registrationId,
  });

  return { outcome: "checked_in", name: view.name, at: now };
}
