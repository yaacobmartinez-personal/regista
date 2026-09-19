import { z } from "zod";
import type { EventStatus, Prisma, RegistrationStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isValidTimeZone, utcToZonedInput, wallClockExists, zonedInputToUtc } from "@/lib/time";
import { slugify } from "@/lib/slug";

/** Turn a title into a URL segment. Same code the client preview runs. */
export const slugifyTitle = slugify;

/**
 * Find a slug free within this tenant, appending -2, -3, … on collision.
 * `exceptEventId` lets an event keep its own slug while editing.
 */
export async function uniqueEventSlug(
  tenantId: string,
  desired: string,
  exceptEventId?: string,
): Promise<string> {
  const base = slugifyTitle(desired) || "event";
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const clash = await prisma.event.findFirst({
      where: { tenantId, slug: candidate, ...(exceptEventId ? { NOT: { id: exceptEventId } } : {}) },
      select: { id: true },
    });
    if (!clash) return candidate;
  }
  return `${base}-${Date.now()}`;
}

/** Seats left, or null when the event has no capacity limit. */
export function seatsRemaining(
  capacity: number | null,
  confirmedCount: number,
): number | null {
  if (capacity === null) return null;
  return Math.max(0, capacity - confirmedCount);
}

const optionalText = z
  .string()
  .trim()
  .max(5000)
  .optional()
  .transform((v) => (v ? v : null));

/**
 * "YYYY-MM-DDTHH:mm" from a datetime-local input — a wall-clock time, no zone.
 * The shape is checked explicitly: `Date.parse` accepts a date on its own (which
 * would silently become midnight) and rolls "T24:00" into the next day.
 */
const WALL_CLOCK_SHAPE = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;

const wallClock = z
  .string()
  .trim()
  .min(1, "Pick a start date and time.")
  .refine(
    (v) => WALL_CLOCK_SHAPE.test(v) && !Number.isNaN(Date.parse(`${v}Z`)),
    "That date doesn't look right.",
  );

/**
 * Event form input. Deliberately excludes tenantId and status so neither can be
 * set from a request body; both are applied server-side.
 *
 * The submitted times are wall-clock values in the event's own timezone; they
 * are converted to UTC instants here so every viewer sees the same local time
 * for the event regardless of where they are.
 */
export const eventInputSchema = z
  .object({
    title: z.string().trim().min(2, "Give the event a title.").max(140),
    slug: z.string().trim().max(63).optional(),
    description: optionalText,
    startsAt: wallClock,
    endsAt: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? v : null))
      .refine(
        (v) =>
          v === null || (WALL_CLOCK_SHAPE.test(v) && !Number.isNaN(Date.parse(`${v}Z`))),
        "That date doesn't look right.",
      ),
    timezone: z
      .string()
      .trim()
      .default("UTC")
      .refine(isValidTimeZone, "Pick a timezone for the event."),
    capacity: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? Number(v) : null))
      .refine(
        (v) => v === null || (Number.isInteger(v) && v > 0 && v <= 1_000_000),
        "Capacity must be a whole number above zero.",
      ),
    waitlistEnabled: z.coerce.boolean().default(false),
  })
  // Checked before conversion, while the wall-clock strings are still intact.
  .superRefine((data, ctx) => {
    if (!isValidTimeZone(data.timezone)) return; // reported by the field itself
    for (const field of ["startsAt", "endsAt"] as const) {
      const value = data[field];
      if (!value) continue;
      if (!wallClockExists(value, data.timezone)) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message:
            "That time doesn't exist on that date in the chosen timezone — the clocks go forward. Pick a different time.",
        });
      }
    }
  })
  .transform((data) => ({
    ...data,
    startsAt: zonedInputToUtc(data.startsAt, data.timezone),
    endsAt: data.endsAt ? zonedInputToUtc(data.endsAt, data.timezone) : null,
  }))
  .refine((data) => !data.endsAt || data.endsAt > data.startsAt, {
    message: "The end time must be after the start time.",
    path: ["endsAt"],
  });


/**
 * Move the longest-waiting people up when an event gains room.
 *
 * Without this, raising capacity (or removing the limit) leaves everyone already
 * waiting exactly where they were while new arrivals are confirmed straight
 * away — so latecomers jump a queue the earlier people are still sitting in.
 *
 * Runs under the same row lock registrations use, so it cannot race a sign-up.
 * Returns how many were promoted.
 */
export async function promoteFromWaitlist(
  tx: Prisma.TransactionClient,
  eventId: string,
): Promise<number> {
  const locked = await tx.$queryRaw<{ capacity: number | null }[]>`
    SELECT capacity FROM "Event" WHERE id = ${eventId} FOR UPDATE
  `;
  const capacity = locked[0]?.capacity ?? null;

  const confirmed = await tx.registration.count({
    where: { eventId, status: "CONFIRMED" },
  });

  const room = capacity === null ? Number.MAX_SAFE_INTEGER : capacity - confirmed;
  if (room <= 0) return 0;

  const waiting = await tx.registration.findMany({
    where: { eventId, status: "WAITLIST" },
    orderBy: { createdAt: "asc" },
    take: capacity === null ? undefined : room,
    select: { id: true },
  });
  if (waiting.length === 0) return 0;

  await tx.registration.updateMany({
    where: { id: { in: waiting.map((r) => r.id) } },
    data: { status: "CONFIRMED" },
  });
  return waiting.length;
}

/** Public registration input. Custom questions are out of scope for v1. */
export const registrationInputSchema = z.object({
  name: z.string().trim().min(1, "Tell us your name.").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
});

/** One event as the mobile API describes it (`EventDetail` in the contract). */
export type EventDetailView = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  timezone: string;
  startsAtLocal: string;
  endsAtLocal: string | null;
  capacity: number | null;
  waitlistEnabled: boolean;
  status: EventStatus;
  confirmed: number;
  waitlist: number;
  checkedIn: number;
  createdAt: string;
};

/**
 * Read one event with its headline numbers, or null when the tenant has no such
 * event.
 *
 * Deliberately re-read after a create or an edit rather than assembled from what
 * was just written: raising capacity promotes people off the waitlist in the
 * same transaction, so the counts the caller should see are the ones in the
 * database, not the ones the request asked for.
 *
 * The `*Local` fields are the wall-clock strings the event's own timezone puts
 * on those instants — the values an edit form needs to show, and the same
 * conversion `utcToZonedInput` does for the web form.
 */
export async function loadEventDetail(
  tenantId: string,
  eventSlug: string,
): Promise<EventDetailView | null> {
  const event = await prisma.event.findFirst({
    where: { tenantId, slug: eventSlug },
  });
  if (!event) return null;

  const [byStatus, checkedIn] = await Promise.all([
    prisma.registration.groupBy({
      by: ["status"],
      where: { tenantId, eventId: event.id },
      _count: { _all: true },
    }),
    prisma.registration.count({
      where: { tenantId, eventId: event.id, checkedInAt: { not: null } },
    }),
  ]);

  const counted = (status: RegistrationStatus) =>
    byStatus.find((row) => row.status === status)?._count._all ?? 0;

  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    description: event.description,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt ? event.endsAt.toISOString() : null,
    timezone: event.timezone,
    startsAtLocal: utcToZonedInput(event.startsAt, event.timezone),
    endsAtLocal: event.endsAt ? utcToZonedInput(event.endsAt, event.timezone) : null,
    capacity: event.capacity,
    waitlistEnabled: event.waitlistEnabled,
    status: event.status,
    confirmed: counted("CONFIRMED"),
    waitlist: counted("WAITLIST"),
    checkedIn,
    createdAt: event.createdAt.toISOString(),
  };
}
