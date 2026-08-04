"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireMembership } from "@/lib/authz";
import { recordAudit } from "@/lib/audit";
import type { PromoteState } from "./shared";

/**
 * Attendee actions. Every write is matched on (id, tenantId) so a registration
 * id belonging to another organization simply does not match.
 */

export async function toggleCheckIn(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const eventSlug = String(formData.get("eventSlug") ?? "");
  const registrationId = String(formData.get("registrationId") ?? "");
  const checkedIn = formData.get("checkedIn") === "true";

  const ctx = await requireMembership(tenantSlug);

  const updated = await prisma.registration.updateMany({
    where: { id: registrationId, tenantId: ctx.tenant.id },
    data: { checkedInAt: checkedIn ? new Date() : null },
  });
  if (updated.count === 0) notFound();

  // Check-in asserts that a named person was physically somewhere at a time,
  // which is about the most sensitive thing derived here — so it is recorded
  // like the other personal-data actions.
  await recordAudit({
    tenantId: ctx.tenant.id,
    actorUserId: ctx.userId,
    action: "CHECK_IN_REGISTRATION",
    targetType: "Registration",
    targetId: registrationId,
  });

  // Route-tree path (the rewrite destination), and the tenant slug comes from
  // the verified context rather than the form body.
  revalidatePath(`/app/o/${ctx.tenant.slug}/events/${eventSlug}/attendees`);
}

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
export async function promoteRegistration(
  _prev: PromoteState | undefined,
  formData: FormData,
): Promise<PromoteState> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const eventSlug = String(formData.get("eventSlug") ?? "");
  const registrationId = String(formData.get("registrationId") ?? "");

  const ctx = await requireMembership(tenantSlug);

  const outcome = await prisma.$transaction(async (tx) => {
    const registration = await tx.registration.findFirst({
      where: { id: registrationId, tenantId: ctx.tenant.id, status: "WAITLIST" },
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
      tenantId: ctx.tenant.id,
      actorUserId: ctx.userId,
      action: "PROMOTE_REGISTRATION",
      targetType: "Registration",
      targetId: registrationId,
    });
    revalidatePath(`/app/o/${ctx.tenant.slug}/events/${eventSlug}/attendees`);
  }

  return { outcome };
}

/**
 * Erase a registrant's personal details (right to erasure).
 *
 * The row is kept so capacity and attendance figures stay accurate, but the
 * identifying fields are cleared. The placeholder address keeps the
 * (eventId, email) uniqueness constraint satisfied without being reversible.
 */
export async function eraseRegistration(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const eventSlug = String(formData.get("eventSlug") ?? "");
  const registrationId = String(formData.get("registrationId") ?? "");

  const ctx = await requireMembership(tenantSlug);

  const registration = await prisma.registration.findFirst({
    where: { id: registrationId, tenantId: ctx.tenant.id },
    select: { id: true, anonymizedAt: true, createdAt: true },
  });
  if (!registration) notFound();
  if (registration.anonymizedAt) return; // already erased

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
    tenantId: ctx.tenant.id,
    actorUserId: ctx.userId,
    action: "ERASE_REGISTRATION",
    targetType: "Registration",
    targetId: registration.id,
  });

  // Route-tree path (the rewrite destination), and the tenant slug comes from
  // the verified context rather than the form body.
  revalidatePath(`/app/o/${ctx.tenant.slug}/events/${eventSlug}/attendees`);
}
