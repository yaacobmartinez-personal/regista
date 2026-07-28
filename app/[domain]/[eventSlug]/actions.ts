"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { resolveActiveTenant } from "@/lib/tenant";
import { registrationInputSchema } from "@/lib/events";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email";
import type { RegisterState } from "./shared";

/**
 * Register a member of the public for a published event.
 *
 * Capacity is enforced under a row lock on the event: concurrent submissions for
 * the final place serialise behind `SELECT … FOR UPDATE`, so the count that
 * decides confirmed-vs-waitlist cannot be read stale. Without the lock, two
 * transactions at READ COMMITTED could both see the last seat as free.
 */
export async function register(
  _prev: RegisterState | undefined,
  formData: FormData,
): Promise<RegisterState> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const eventSlug = String(formData.get("eventSlug") ?? "");

  const ip = await clientIp();
  const limit = rateLimit(`register:${ip}`, 20, 60 * 60);
  if (!limit.ok) {
    return { error: "Too many sign-ups from this connection. Try again shortly." };
  }

  const parsed = registrationInputSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
  });
  if (!parsed.success) {
    const fieldErrors: RegisterState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as "name" | "email";
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const tenant = await resolveActiveTenant(tenantSlug);
  if (!tenant) return { outcome: "closed" };

  const { name, email } = parsed.data;

  let result: { outcome: RegisterState["outcome"]; eventTitle?: string };
  try {
    result = await prisma.$transaction(async (tx) => {
      const event = await tx.event.findFirst({
        where: { tenantId: tenant.id, slug: eventSlug, status: "PUBLISHED" },
      });
      if (!event) return { outcome: "closed" as const };

      // Serialise concurrent registrations for this event.
      await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${event.id} FOR UPDATE`;

      const confirmed = await tx.registration.count({
        where: { eventId: event.id, status: "CONFIRMED" },
      });

      const isFull = event.capacity !== null && confirmed >= event.capacity;
      if (isFull && !event.waitlistEnabled) {
        return { outcome: "full" as const, eventTitle: event.title };
      }

      await tx.registration.create({
        data: {
          tenantId: tenant.id,
          eventId: event.id,
          name,
          email,
          status: isFull ? "WAITLIST" : "CONFIRMED",
        },
      });

      return {
        outcome: (isFull ? "waitlisted" : "confirmed") as "waitlisted" | "confirmed",
        eventTitle: event.title,
      };
    });
  } catch (error) {
    // Unique (eventId, email): this address already signed up.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { outcome: "duplicate" };
    }
    throw error;
  }

  if (result.outcome === "confirmed" || result.outcome === "waitlisted") {
    const waitlisted = result.outcome === "waitlisted";
    await sendEmail({
      to: email,
      subject: waitlisted
        ? `You're on the waitlist for ${result.eventTitle}`
        : `You're registered for ${result.eventTitle}`,
      text: [
        `Hi ${name},`,
        ``,
        waitlisted
          ? `${result.eventTitle} is currently full, so you're on the waitlist. We'll be in touch if a place opens up.`
          : `You're registered for ${result.eventTitle}. We look forward to seeing you.`,
        ``,
        `— ${tenant.name}`,
      ].join("\n"),
    });

    revalidatePath(`/${tenantSlug}/${eventSlug}`);
  }

  return { outcome: result.outcome };
}
