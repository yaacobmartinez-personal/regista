import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/tokens";
import { recordAudit } from "@/lib/audit";

/**
 * Registrant self-service.
 *
 * People who sign up have no account, so the link mailed with their confirmation
 * is what identifies them. It carries the same trust as the mailbox it was sent
 * to — which is the same bar the confirmation itself already met, since that
 * message names the event they are attending.
 *
 * The token is stored as a SHA-256 hash like every other token here, so a
 * database leak cannot be replayed as a live link.
 */

export type ManagedRegistration = {
  id: string;
  name: string | null;
  email: string;
  status: "CONFIRMED" | "WAITLIST" | "CANCELLED";
  createdAt: Date;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  eventTitle: string;
  eventSlug: string;
  startsAt: Date;
  endsAt: Date | null;
  timezone: string;
  /** True once the event has begun — past that, cancelling changes nothing real. */
  started: boolean;
  /** Ticket token for the check-in QR; null once erased. */
  checkInToken: string | null;
};

/**
 * Read a registration from its management token. Read-only by design: the page
 * that renders this must not spend or change anything, or a link-scanning mail
 * client could cancel somebody's place before they ever opened the message.
 */
export async function inspectRegistration(
  rawToken: string | undefined,
): Promise<ManagedRegistration | null> {
  if (!rawToken) return null;

  const registration = await prisma.registration.findUnique({
    where: { manageToken: hashToken(rawToken) },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      createdAt: true,
      anonymizedAt: true,
      checkInToken: true,
      tenant: { select: { id: true, name: true, slug: true, status: true } },
      event: {
        select: {
          title: true,
          slug: true,
          startsAt: true,
          endsAt: true,
          timezone: true,
        },
      },
    },
  });

  if (!registration) return null;
  // An erased record has no personal data left to show, and a suspended
  // organization's pages are not served at all.
  if (registration.anonymizedAt) return null;
  if (registration.tenant.status !== "ACTIVE") return null;

  return {
    id: registration.id,
    name: registration.name,
    email: registration.email,
    status: registration.status,
    createdAt: registration.createdAt,
    tenantId: registration.tenant.id,
    tenantName: registration.tenant.name,
    tenantSlug: registration.tenant.slug,
    eventTitle: registration.event.title,
    eventSlug: registration.event.slug,
    startsAt: registration.event.startsAt,
    endsAt: registration.event.endsAt,
    timezone: registration.event.timezone,
    started: registration.event.startsAt.getTime() <= Date.now(),
    checkInToken: registration.checkInToken,
  };
}

export type CancelOutcome = "cancelled" | "already" | "started" | "invalid";

/**
 * Give up a place.
 *
 * The row survives — cancelling is not erasure, and the organization still needs
 * to know the place was released and by whom. Erasure stays a separate, explicit
 * request.
 *
 * No waitlist promotion happens here. Freeing a seat and deciding who takes it
 * are different judgements, and the second one belongs to the organizer.
 */
export async function cancelRegistration(
  rawToken: string | undefined,
): Promise<{ outcome: CancelOutcome; registration?: ManagedRegistration }> {
  const registration = await inspectRegistration(rawToken);
  if (!registration) return { outcome: "invalid" };
  if (registration.status === "CANCELLED") {
    return { outcome: "already", registration };
  }
  if (registration.started) return { outcome: "started", registration };

  // Conditional update: two clicks on the same link race to be the one that
  // changes the row, and only one of them should count as the cancellation.
  const changed = await prisma.registration.updateMany({
    where: { id: registration.id, status: { not: "CANCELLED" } },
    data: { status: "CANCELLED" },
  });
  if (changed.count === 0) {
    return { outcome: "already", registration: { ...registration, status: "CANCELLED" } };
  }

  // A place coming free needs the same trail as the organizer actions do,
  // otherwise the guest list changes with nothing to say why.
  await recordAudit({
    tenantId: registration.tenantId,
    actorUserId: null,
    action: "CANCEL_REGISTRATION",
    targetType: "Registration",
    targetId: registration.id,
  });

  return {
    outcome: "cancelled",
    registration: { ...registration, status: "CANCELLED" },
  };
}
