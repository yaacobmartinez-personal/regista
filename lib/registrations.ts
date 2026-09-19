import type { Prisma, RegistrationStatus } from "@prisma/client";
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

/**
 * A registration as its owner sees it in the app (`Ticket` in the contract).
 *
 * The same facts the emailed management page shows, addressed by account rather
 * than by a link. `checkInToken` is here because the app draws the QR from it,
 * exactly as that page does.
 */
export type TicketView = {
  id: string;
  status: RegistrationStatus;
  name: string | null;
  email: string;
  checkedInAt: string | null;
  checkInToken: string | null;
  createdAt: string;
  /** True once the event has begun — past that, cancelling changes nothing. */
  started: boolean;
  org: { slug: string; name: string };
  event: {
    slug: string;
    title: string;
    startsAt: string;
    endsAt: string | null;
    timezone: string;
  };
};

const ticketSelect = {
  id: true,
  status: true,
  name: true,
  email: true,
  checkedInAt: true,
  checkInToken: true,
  createdAt: true,
  tenant: { select: { slug: true, name: true } },
  event: {
    select: { slug: true, title: true, startsAt: true, endsAt: true, timezone: true },
  },
} satisfies Prisma.RegistrationSelect;

type TicketRow = Prisma.RegistrationGetPayload<{ select: typeof ticketSelect }>;

function toTicket(row: TicketRow): TicketView {
  return {
    id: row.id,
    status: row.status,
    name: row.name,
    email: row.email,
    checkedInAt: row.checkedInAt ? row.checkedInAt.toISOString() : null,
    checkInToken: row.checkInToken,
    createdAt: row.createdAt.toISOString(),
    started: row.event.startsAt.getTime() <= Date.now(),
    org: { slug: row.tenant.slug, name: row.tenant.name },
    event: {
      slug: row.event.slug,
      title: row.event.title,
      startsAt: row.event.startsAt.toISOString(),
      endsAt: row.event.endsAt ? row.event.endsAt.toISOString() : null,
      timezone: row.event.timezone,
    },
  };
}

/**
 * Every place this account holds, newest first.
 *
 * Erased registrations are left out: the row survives for the organizer's
 * headcount, but it no longer describes a person and has nothing to show whoever
 * it used to belong to. A suspended organization's places are hidden for the
 * same reason its public pages are not served.
 */
export async function ticketsForUser(userId: string): Promise<TicketView[]> {
  const rows = await prisma.registration.findMany({
    where: { userId, anonymizedAt: null, tenant: { status: "ACTIVE" } },
    orderBy: { createdAt: "desc" },
    select: ticketSelect,
  });
  return rows.map(toTicket);
}

/** One of this account's places, or null when it is not theirs. */
export async function ticketForUser(
  userId: string,
  registrationId: string,
): Promise<TicketView | null> {
  const row = await prisma.registration.findFirst({
    where: { id: registrationId, userId, anonymizedAt: null, tenant: { status: "ACTIVE" } },
    select: ticketSelect,
  });
  return row ? toTicket(row) : null;
}

/** One place by id, regardless of owner — for reading back a just-taken place. */
export async function ticketById(registrationId: string): Promise<TicketView | null> {
  const row = await prisma.registration.findFirst({
    where: { id: registrationId, anonymizedAt: null },
    select: ticketSelect,
  });
  return row ? toTicket(row) : null;
}

/**
 * Give up a place held by an account.
 *
 * The same rules as `cancelRegistration`, which works from the emailed link:
 * the row survives, no one is promoted in the canceller's place, and an event
 * that has already begun is past the point where leaving changes anything. The
 * difference is who is asking — here it is a signed-in account, so the audit
 * entry names them, where the link-based one has no actor to name.
 */
export async function cancelTicket(
  userId: string,
  registrationId: string,
): Promise<{ outcome: CancelOutcome; ticket?: TicketView }> {
  const row = await prisma.registration.findFirst({
    where: { id: registrationId, userId, anonymizedAt: null, tenant: { status: "ACTIVE" } },
    select: { id: true, status: true, tenantId: true, event: { select: { startsAt: true } } },
  });
  if (!row) return { outcome: "invalid" };

  if (row.status === "CANCELLED") {
    return { outcome: "already", ticket: (await ticketById(row.id)) ?? undefined };
  }
  if (row.event.startsAt.getTime() <= Date.now()) {
    return { outcome: "started", ticket: (await ticketById(row.id)) ?? undefined };
  }

  // Conditional update: two taps race to be the one that changes the row, and
  // only one of them should count as the cancellation.
  const changed = await prisma.registration.updateMany({
    where: { id: row.id, status: { not: "CANCELLED" } },
    data: { status: "CANCELLED" },
  });
  if (changed.count === 0) {
    return { outcome: "already", ticket: (await ticketById(row.id)) ?? undefined };
  }

  await recordAudit({
    tenantId: row.tenantId,
    actorUserId: userId,
    action: "CANCEL_REGISTRATION",
    targetType: "Registration",
    targetId: row.id,
  });

  return { outcome: "cancelled", ticket: (await ticketById(row.id)) ?? undefined };
}
