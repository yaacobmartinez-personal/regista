import { z } from "zod";
import { prisma } from "@/lib/db";

/** Turn a title into a URL segment. Mirrors the client-side preview. */
export function slugifyTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 63);
}

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

/** Datetime-local inputs submit "YYYY-MM-DDTHH:mm" with no zone. */
const localDateTime = z
  .string()
  .trim()
  .min(1, "Pick a start date and time.")
  .refine((v) => !Number.isNaN(Date.parse(v)), "That date doesn't look right.")
  .transform((v) => new Date(v));

const optionalLocalDateTime = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? new Date(v) : null))
  .refine((v) => v === null || !Number.isNaN(v.getTime()), "That date doesn't look right.");

/**
 * Event form input. Deliberately excludes tenantId and status so neither can be
 * set from a request body; both are applied server-side.
 */
export const eventInputSchema = z
  .object({
    title: z.string().trim().min(2, "Give the event a title.").max(140),
    slug: z.string().trim().max(63).optional(),
    description: optionalText,
    startsAt: localDateTime,
    endsAt: optionalLocalDateTime,
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
  .refine((data) => !data.endsAt || data.endsAt >= data.startsAt, {
    message: "The end time must be after the start time.",
    path: ["endsAt"],
  });

export type EventInput = z.infer<typeof eventInputSchema>;

/** Public registration input. Custom questions are out of scope for v1. */
export const registrationInputSchema = z.object({
  name: z.string().trim().min(1, "Tell us your name.").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
});
