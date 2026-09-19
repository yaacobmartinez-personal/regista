import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resolveActiveTenant } from "@/lib/tenant";
import { sendTemplate } from "@/lib/email";
import { formatEventWhen } from "@/lib/time";
import { createSecureToken, createCheckInToken } from "@/lib/tokens";
import { eventUrl, manageRegistrationUrl } from "@/lib/urls";
import { EventRegistration, eventRegistrationText } from "@/emails/event-registration";

/**
 * Register a member of the public for a published event.
 *
 * Shared by the public web form and the mobile API. The only difference between
 * them is where the identity comes from: the form asks for a name and an email
 * and links the place to nobody, while the app supplies the signed-in account's
 * verified address and links the place to it. Everything that decides whether
 * there is a place — the row lock, the waitlist, the rejoin-after-cancel rule —
 * is the same code for both, because a second copy of it would eventually
 * oversell an event.
 *
 * Capacity is enforced under a row lock on the event: concurrent submissions for
 * the final place serialise behind `SELECT … FOR UPDATE`, so the count that
 * decides confirmed-vs-waitlist cannot be read stale. Without the lock, two
 * transactions at READ COMMITTED could both see the last seat as free.
 */

export type RegisterOutcome =
  | "confirmed"
  | "waitlisted"
  | "full"
  | "duplicate"
  | "closed";

export type RegisterResult = {
  outcome?: RegisterOutcome;
  /** The place taken or already held — present for confirmed, waitlisted, duplicate. */
  registrationId?: string;
  /** Contention or another transient failure: not an outcome, ask them to retry. */
  error?: string;
};

type EventSummary = {
  title: string;
  slug: string;
  startsAt: Date;
  endsAt: Date | null;
  timezone: string;
};

export async function registerForEvent(input: {
  tenantSlug: string;
  eventSlug: string;
  name: string;
  email: string;
  /**
   * Links the place to an account. The web form passes nothing — a sign-up
   * there needs no account, and the emailed link stays the only key.
   */
  userId?: string;
}): Promise<RegisterResult> {
  const { tenantSlug, eventSlug, name, email, userId } = input;

  const tenant = await resolveActiveTenant(tenantSlug);
  if (!tenant) return { outcome: "closed" };

  // Minted outside the transaction so a retry after contention doesn't reuse a
  // value that a rolled-back attempt already wrote.
  const manage = createSecureToken();
  const checkInToken = createCheckInToken();

  let result: { outcome: RegisterOutcome; registrationId?: string; event?: EventSummary };
  try {
    result = await prisma.$transaction(
      async (tx) => {
        const found = await tx.event.findFirst({
          where: { tenantId: tenant.id, slug: eventSlug, status: "PUBLISHED" },
        });
        if (!found) return { outcome: "closed" as const };
        const event = found;

        // Serialise concurrent registrations for this event, and take the limits
        // from the locked row. Reading them from the unlocked select above would
        // pair a possibly-stale capacity with a fresh count, so a capacity change
        // landing mid-transaction could still oversell.
        const locked = await tx.$queryRaw<
          { capacity: number | null; waitlistEnabled: boolean }[]
        >`SELECT capacity, "waitlistEnabled" FROM "Event" WHERE id = ${event.id} FOR UPDATE`;

        const limits = locked[0];
        if (!limits) return { outcome: "closed" as const };

        const confirmed = await tx.registration.count({
          where: { eventId: event.id, status: "CONFIRMED" },
        });

        const summary: EventSummary = {
          title: event.title,
          slug: event.slug,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          timezone: event.timezone,
        };

        // The (eventId, email) row outlives a cancellation, so someone who changed
        // their mind twice would otherwise be told they are already registered
        // while holding no place at all.
        const existing = await tx.registration.findUnique({
          where: { eventId_email: { eventId: event.id, email } },
          select: { id: true, status: true, userId: true },
        });
        if (existing && existing.status !== "CANCELLED") {
          // The address on the row is this account's verified address, so the
          // place is already theirs — claim it. Without this the app would show
          // them a ticket that never appears in their list.
          if (userId && existing.userId === null) {
            await tx.registration.update({
              where: { id: existing.id },
              data: { userId },
            });
          }
          return { outcome: "duplicate" as const, registrationId: existing.id };
        }

        const isFull = limits.capacity !== null && confirmed >= limits.capacity;
        if (isFull && !limits.waitlistEnabled) {
          return { outcome: "full" as const, event: summary };
        }

        const status = isFull ? ("WAITLIST" as const) : ("CONFIRMED" as const);

        const registrationId = existing
          ? (
              await tx.registration.update({
                where: { id: existing.id },
                data: {
                  name,
                  status,
                  manageToken: manage.hash,
                  // A fresh ticket for the fresh registration.
                  checkInToken,
                  // Back of the queue. They left it; rejoining ahead of people who
                  // waited through would not be the fair reading of "first come".
                  createdAt: new Date(),
                  ...(userId ? { userId } : {}),
                },
                select: { id: true },
              })
            ).id
          : (
              await tx.registration.create({
                data: {
                  tenantId: tenant.id,
                  eventId: event.id,
                  name,
                  email,
                  status,
                  manageToken: manage.hash,
                  checkInToken,
                  userId: userId ?? null,
                },
                select: { id: true },
              })
            ).id;

        return {
          outcome: (isFull ? "waitlisted" : "confirmed") as "waitlisted" | "confirmed",
          registrationId,
          event: summary,
        };
      },
      {
        // Registrations for one event queue behind the row lock by design, so
        // allow more waiting room than the default before giving up.
        maxWait: 10_000,
        timeout: 15_000,
      },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // Unique (eventId, email): this address already signed up.
      if (error.code === "P2002") return { outcome: "duplicate" };

      // The row lock deliberately serialises registrations for one event, so a
      // rush at the moment registration opens can exceed the transaction
      // window. That's contention, not a failure the person can do anything
      // about, so ask them to retry rather than showing a crash.
      if (error.code === "P2028" || error.code === "P2034") {
        return {
          error: "Lots of people are signing up right now. Please try again in a moment.",
        };
      }

      // The event was deleted between resolving it and writing the row.
      if (error.code === "P2003" || error.code === "P2025") {
        return { outcome: "closed" };
      }
    }
    throw error;
  }

  if ((result.outcome === "confirmed" || result.outcome === "waitlisted") && result.event) {
    const waitlisted = result.outcome === "waitlisted";
    const event = result.event;

    // The message tells attendees to reply to the organizer if they need their
    // details changed or removed, so a reply has to actually reach one. Uses the
    // longest-standing admin as the organization's contact.
    const organizerContact = await prisma.membership.findFirst({
      where: { tenantId: tenant.id, role: "ADMIN" },
      orderBy: { createdAt: "asc" },
      select: { user: { select: { email: true } } },
    });

    const props = {
      attendeeName: name,
      eventTitle: event.title,
      // Always the event's own timezone, so the email agrees with the page.
      eventWhen: formatEventWhen(event.startsAt, event.endsAt, event.timezone),
      organizationName: tenant.name,
      eventUrl: eventUrl(tenant.slug, event.slug),
      manageUrl: manageRegistrationUrl(tenant.slug, event.slug, manage.raw),
      waitlisted,
    };

    // The place is already booked at this point. A mail failure must not throw
    // that away and tell the person they aren't registered — on retry they'd be
    // told they already are, which is the opposite of the truth.
    try {
      await sendTemplate({
        to: email,
        subject: waitlisted
          ? `You're on the waitlist for ${event.title}`
          : `You're registered for ${event.title}`,
        template: <EventRegistration {...props} />,
        text: eventRegistrationText(props),
        replyTo: organizerContact?.user.email,
      });
    } catch {
      // Deliberately swallowed: the registration stands, and the confirmation
      // is a courtesy rather than the record.
      console.error("Registration confirmation email failed to send.");
    }
  }

  return { outcome: result.outcome, registrationId: result.registrationId };
}

/** The public event page, whose availability line this changes. */
export function registeredEventPath(tenantSlug: string, eventSlug: string): string {
  return `/${tenantSlug}/${eventSlug}`;
}
