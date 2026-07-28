"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireMembership } from "@/lib/authz";
import { eventInputSchema, uniqueEventSlug } from "@/lib/events";
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
  const slug = await uniqueEventSlug(ctx.tenant.id, data.slug || data.title, existing.id);

  await prisma.event.update({
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

  const deleted = await prisma.event.deleteMany({
    where: { id: eventId, tenantId: ctx.tenant.id },
  });
  if (deleted.count === 0) notFound();

  revalidatePath(`/o/${ctx.tenant.slug}`);
  redirect(`/o/${ctx.tenant.slug}`);
}
