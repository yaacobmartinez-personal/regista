"use server";

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireMembership } from "@/lib/authz";
import { recordAudit } from "@/lib/audit";
import { eraseRegistrationData, promoteWaitlisted } from "@/lib/attendees";
import { revalidateAttendeeList } from "@/lib/event-surfaces";
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
  revalidateAttendeeList(ctx.tenant.slug, eventSlug);
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

  const outcome = await promoteWaitlisted(
    { tenantId: ctx.tenant.id, userId: ctx.userId },
    registrationId,
  );

  if (outcome === "promoted") {
    revalidateAttendeeList(ctx.tenant.slug, eventSlug);
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

  const outcome = await eraseRegistrationData(
    { tenantId: ctx.tenant.id, userId: ctx.userId },
    registrationId,
  );
  if (outcome === "gone") notFound();

  // Route-tree path (the rewrite destination), and the tenant slug comes from
  // the verified context rather than the form body.
  revalidateAttendeeList(ctx.tenant.slug, eventSlug);
}
