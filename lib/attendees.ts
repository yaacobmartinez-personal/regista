import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { toCsv } from "@/lib/csv";

/**
 * Attendee operations an organizer performs on one registration.
 *
 * Lifted out of the dashboard's server actions so the mobile API runs the same
 * code rather than a second copy of it. These take the acting member's verified
 * context and a registration id, and know nothing about forms, redirects or
 * cache revalidation — each caller does its own.
 *
 * Every read and write is matched on (id, tenantId), so a registration id from
 * another organization simply does not resolve.
 */

export type ActingMember = { tenantId: string; userId: string };

export type PromoteOutcome =
  /** Moved into a confirmed place. */
  | "promoted"
  /** The event is at capacity — raise it rather than overriding here. */
  | "full"
  /** No longer waitlisted: cancelled, already promoted, or never there. */
  | "gone";

/**
 * Move one waitlisted person into a confirmed place.
 *
 * Cancelling deliberately does not promote anyone automatically — the decision
 * of who takes a freed place belongs to the organizer — so this is the control
 * that makes that decision actionable.
 *
 * Runs under the same event row lock registrations take, so it cannot confirm
 * the last seat at the same moment a public sign-up does.
 */
export async function promoteWaitlisted(
  acting: ActingMember,
  registrationId: string,
): Promise<PromoteOutcome> {
  const outcome = await prisma.$transaction(async (tx) => {
    const registration = await tx.registration.findFirst({
      where: { id: registrationId, tenantId: acting.tenantId, status: "WAITLIST" },
      select: { id: true, eventId: true },
    });
    if (!registration) return "gone" as const;

    const locked = await tx.$queryRaw<{ capacity: number | null }[]>`
      SELECT capacity FROM "Event" WHERE id = ${registration.eventId} FOR UPDATE
    `;
    const capacity = locked[0]?.capacity ?? null;

    const confirmed = await tx.registration.count({
      where: { eventId: registration.eventId, status: "CONFIRMED" },
    });
    // Refused rather than allowed as an override: an organizer who wants more
    // people in the room can raise the capacity, which promotes the queue in
    // order. Quietly exceeding the stated limit here would put the count on the
    // public page at odds with the guest list.
    if (capacity !== null && confirmed >= capacity) return "full" as const;

    const changed = await tx.registration.updateMany({
      where: { id: registration.id, status: "WAITLIST" },
      data: { status: "CONFIRMED" },
    });
    return changed.count === 1 ? ("promoted" as const) : ("gone" as const);
  });

  if (outcome === "promoted") {
    await recordAudit({
      tenantId: acting.tenantId,
      actorUserId: acting.userId,
      action: "PROMOTE_REGISTRATION",
      targetType: "Registration",
      targetId: registrationId,
    });
  }

  return outcome;
}

export type EraseOutcome =
  | "erased"
  /** Already anonymized — erasure is idempotent, not an error. */
  | "already"
  /** No such registration in this organization. */
  | "gone";

/**
 * Erase a registrant's personal details (right to erasure).
 *
 * The row is kept so capacity and attendance figures stay accurate, but the
 * identifying fields are cleared. The placeholder address keeps the
 * (eventId, email) uniqueness constraint satisfied without being reversible.
 */
export async function eraseRegistrationData(
  acting: ActingMember,
  registrationId: string,
): Promise<EraseOutcome> {
  const registration = await prisma.registration.findFirst({
    where: { id: registrationId, tenantId: acting.tenantId },
    select: { id: true, anonymizedAt: true, createdAt: true },
  });
  if (!registration) return "gone";
  if (registration.anonymizedAt) return "already";

  // Coarsen the sign-up time to the day as well as clearing the identifiers.
  // Kept to the second, the row could be matched back to a person using any CSV
  // exported before the erasure — the timestamp alone is close to unique.
  const coarseCreatedAt = new Date(registration.createdAt);
  coarseCreatedAt.setUTCHours(0, 0, 0, 0);

  await prisma.registration.update({
    where: { id: registration.id },
    data: {
      name: null,
      email: `deleted+${registration.id}@anon.invalid`,
      customFields: Prisma.DbNull,
      createdAt: coarseCreatedAt,
      // Check-in time is equally identifying, and an erased record doesn't need
      // to say whether they turned up.
      checkedInAt: null,
      // The link in their confirmation dies with the data it reached. Left
      // alive, it would keep opening a page about a person who asked to be
      // forgotten.
      manageToken: null,
      // Same for the QR ticket — an erased person should not resolve at a door.
      checkInToken: null,
      anonymizedAt: new Date(),
    },
  });

  await recordAudit({
    tenantId: acting.tenantId,
    actorUserId: acting.userId,
    action: "ERASE_REGISTRATION",
    targetType: "Registration",
    targetId: registration.id,
  });

  return "erased";
}

/**
 * Serialise an event's attendee list as CSV.
 *
 * Shared by the dashboard download and the mobile export so the two cannot
 * drift: the contract promises the same columns from both, and a spreadsheet
 * that changed shape depending on which front end produced it would break
 * whatever the organizer feeds it to.
 *
 * Erased rows are kept and marked, rather than dropped — the place was real and
 * still counts towards the numbers — and `lib/csv.ts` neutralises any cell that
 * a spreadsheet would otherwise run as a formula.
 */
export async function attendeeCsv(tenantId: string, eventId: string): Promise<string> {
  const registrations = await prisma.registration.findMany({
    where: { tenantId, eventId },
    orderBy: { createdAt: "asc" },
  });

  return toCsv(
    ["Name", "Email", "Status", "Checked in", "Registered at"],
    registrations.map((r) => [
      r.anonymizedAt ? "(erased)" : r.name,
      r.anonymizedAt ? "(erased)" : r.email,
      r.status,
      r.checkedInAt ? r.checkedInAt.toISOString() : "",
      r.createdAt.toISOString(),
    ]),
  );
}
