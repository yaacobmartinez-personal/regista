"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireMembership } from "@/lib/authz";
import { recordAudit } from "@/lib/audit";

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

  revalidatePath(`/o/${tenantSlug}/events/${eventSlug}/attendees`);
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

  revalidatePath(`/o/${tenantSlug}/events/${eventSlug}/attendees`);
}
