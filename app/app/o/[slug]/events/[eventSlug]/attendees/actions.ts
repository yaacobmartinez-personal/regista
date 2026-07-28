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
    select: { id: true, anonymizedAt: true },
  });
  if (!registration) notFound();
  if (registration.anonymizedAt) return; // already erased

  await prisma.registration.update({
    where: { id: registration.id },
    data: {
      name: null,
      email: `deleted+${registration.id}@anon.invalid`,
      customFields: Prisma.DbNull,
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
