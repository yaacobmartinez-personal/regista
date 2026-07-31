"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireMembership } from "@/lib/authz";
import { recordAudit } from "@/lib/audit";
import { eventInputSchema, promoteFromWaitlist, uniqueEventSlug } from "@/lib/events";
import type { EventFormState } from "./shared";

/**
 * Every action re-derives the caller's membership from the database, so a forged
 * tenant slug in the form body simply fails the check. Reads and writes are then
 * scoped by that tenant id — never by event id alone.
 */

function parseEventForm(formData: FormData) {
  return eventInputSchema.safeParse({
    title: formData.get("title"),
    slug: formData.get("slug") ?? undefined,
    description: formData.get("description") ?? undefined,
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt") ?? undefined,
    timezone: formData.get("timezone") ?? undefined,
    capacity: formData.get("capacity") ?? undefined,
    waitlistEnabled: formData.get("waitlistEnabled") === "on",
  });
}

function collectFieldErrors(
  issues: { path: PropertyKey[]; message: string }[],
): EventFormState["fieldErrors"] {
  const fieldErrors: EventFormState["fieldErrors"] = {};
  for (const issue of issues) {
    const key = issue.path[0] as keyof NonNullable<EventFormState["fieldErrors"]>;
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

export async function createEvent(
  _prev: EventFormState | undefined,
  formData: FormData,
): Promise<EventFormState> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const ctx = await requireMembership(tenantSlug);

  const parsed = parseEventForm(formData);
  if (!parsed.success) {
    return { fieldErrors: collectFieldErrors(parsed.error.issues) };
  }

  const data = parsed.data;
  const slug = await uniqueEventSlug(ctx.tenant.id, data.slug || data.title);

  await prisma.event.create({
    data: {
      tenantId: ctx.tenant.id,
      slug,
      title: data.title,
      description: data.description,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      timezone: data.timezone,
      capacity: data.capacity,
      waitlistEnabled: data.waitlistEnabled,
      status: "DRAFT", // publishing is a separate, explicit step
    },
  });

  revalidatePath(`/o/${ctx.tenant.slug}`);
  redirect(`/o/${ctx.tenant.slug}`);
}

export async function updateEvent(
  _prev: EventFormState | undefined,
  formData: FormData,
): Promise<EventFormState> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const eventId = String(formData.get("eventId") ?? "");
  const ctx = await requireMembership(tenantSlug);

  const existing = await prisma.event.findFirst({
    where: { id: eventId, tenantId: ctx.tenant.id },
    select: { id: true },
  });
  if (!existing) notFound();

  const parsed = parseEventForm(formData);
  if (!parsed.success) {
    return { fieldErrors: collectFieldErrors(parsed.error.issues) };
  }

  const data = parsed.data;

  // Capacity below the number of people already holding a place would leave the
  // public page reading "Full" while the dashboard shows more registered than
  // the limit. Refuse it and say what the floor is.
  if (data.capacity !== null) {
    const confirmed = await prisma.registration.count({
      where: { tenantId: ctx.tenant.id, eventId: existing.id, status: "CONFIRMED" },
    });
    if (data.capacity < confirmed) {
      return {
        fieldErrors: {
          capacity: `${confirmed} people already have a place, so capacity can't be lower than that.`,
        },
      };
    }
  }

  const slug = await uniqueEventSlug(ctx.tenant.id, data.slug || data.title, existing.id);

  await prisma.$transaction(async (tx) => {
    await tx.event.update({
      where: { id: existing.id },
      data: {
        slug,
        title: data.title,
        description: data.description,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        timezone: data.timezone,
        capacity: data.capacity,
        waitlistEnabled: data.waitlistEnabled,
      },
    });

    // If that made room, the people who have been waiting longest get it.
    await promoteFromWaitlist(tx, existing.id);
  });

  revalidatePath(`/o/${ctx.tenant.slug}`);
  redirect(`/o/${ctx.tenant.slug}`);
}

/** Publish or close an event. Status is only ever set through this action. */
export async function setEventStatus(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const eventId = String(formData.get("eventId") ?? "");
  const requested = String(formData.get("status") ?? "");
  const ctx = await requireMembership(tenantSlug);

  if (requested !== "PUBLISHED" && requested !== "DRAFT" && requested !== "CLOSED") {
    return;
  }

  const updated = await prisma.event.updateMany({
    where: { id: eventId, tenantId: ctx.tenant.id },
    data: { status: requested },
  });
  if (updated.count === 0) notFound();

  revalidatePath(`/o/${ctx.tenant.slug}`);
}

export async function deleteEvent(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const eventId = String(formData.get("eventId") ?? "");
  const ctx = await requireMembership(tenantSlug, "ADMIN");

  const event = await prisma.event.findFirst({
    where: { id: eventId, tenantId: ctx.tenant.id },
    select: { id: true, _count: { select: { registrations: true } } },
  });
  if (!event) notFound();

  // Deleting cascades to every registration, so record it before the rows are
  // gone — including how many people's details went with it. Written first so a
  // failure to log is a failure to delete, not a silent untracked deletion.
  await recordAudit({
    tenantId: ctx.tenant.id,
    actorUserId: ctx.userId,
    action: "DELETE_EVENT",
    targetType: "Event",
    targetId: `${event.id} (${event._count.registrations} registrations)`,
  });

  await prisma.event.deleteMany({
    where: { id: event.id, tenantId: ctx.tenant.id },
  });

  revalidatePath(`/o/${ctx.tenant.slug}`);
  redirect(`/o/${ctx.tenant.slug}`);
}
