"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createEvent, updateEvent } from "./actions";
import type { EventFormState } from "./shared";

export type EventFormValues = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  startsAt: string; // ISO
  endsAt: string | null; // ISO
  capacity: number | null;
  waitlistEnabled: boolean;
};

/** Format an ISO instant for a datetime-local input in the viewer's timezone. */
function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function slugifyTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 63);
}

const field =
  "rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm placeholder:text-faint focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25";
const errorText = "text-xs text-red-600 dark:text-red-400";

export function EventForm({
  tenantSlug,
  publicHost,
  event,
}: {
  tenantSlug: string;
  publicHost: string;
  event?: EventFormValues;
}) {
  const isEdit = Boolean(event);
  const [state, formAction, pending] = useActionState<EventFormState | undefined, FormData>(
    isEdit ? updateEvent : createEvent,
    undefined,
  );

  const [title, setTitle] = useState(event?.title ?? "");
  const [slug, setSlug] = useState(event?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(Boolean(event));
  const effectiveSlug = slugEdited ? slug : slugifyTitle(title);

  return (
    <form action={formAction} className="mt-8 flex max-w-xl flex-col gap-5">
      <input type="hidden" name="tenantSlug" value={tenantSlug} />
      {event ? <input type="hidden" name="eventId" value={event.id} /> : null}

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Title</span>
        <input
          name="title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Summer Meetup"
          className={field}
        />
        {state?.fieldErrors?.title ? (
          <span className={errorText}>{state.fieldErrors.title}</span>
        ) : null}
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Link</span>
        <input
          name="slug"
          value={effectiveSlug}
          onChange={(e) => {
            setSlugEdited(true);
            setSlug(slugifyTitle(e.target.value));
          }}
          placeholder="summer-meetup"
          className={field}
        />
        <span className="font-mono text-xs text-faint">
          {publicHost}/{effectiveSlug || "…"}
        </span>
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">
          Description <span className="font-normal text-faint">(optional)</span>
        </span>
        <textarea
          name="description"
          rows={4}
          defaultValue={event?.description ?? ""}
          placeholder="What should people know before they sign up?"
          className={`${field} resize-y`}
        />
      </label>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Starts</span>
          <input
            name="startsAt"
            type="datetime-local"
            required
            defaultValue={toLocalInputValue(event?.startsAt)}
            suppressHydrationWarning
            className={field}
          />
          {state?.fieldErrors?.startsAt ? (
            <span className={errorText}>{state.fieldErrors.startsAt}</span>
          ) : null}
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">
            Ends <span className="font-normal text-faint">(optional)</span>
          </span>
          <input
            name="endsAt"
            type="datetime-local"
            defaultValue={toLocalInputValue(event?.endsAt)}
            suppressHydrationWarning
            className={field}
          />
          {state?.fieldErrors?.endsAt ? (
            <span className={errorText}>{state.fieldErrors.endsAt}</span>
          ) : null}
        </label>
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">
          Capacity <span className="font-normal text-faint">(optional)</span>
        </span>
        <input
          name="capacity"
          type="number"
          min={1}
          inputMode="numeric"
          defaultValue={event?.capacity ?? ""}
          placeholder="Leave empty for no limit"
          className={`${field} max-w-48`}
        />
        {state?.fieldErrors?.capacity ? (
          <span className={errorText}>{state.fieldErrors.capacity}</span>
        ) : null}
      </label>

      <label className="flex items-start gap-3 rounded-lg border border-line bg-surface p-4 text-sm">
        <input
          name="waitlistEnabled"
          type="checkbox"
          defaultChecked={event?.waitlistEnabled ?? false}
          className="mt-0.5 h-4 w-4 accent-accent"
        />
        <span>
          <span className="font-medium">Keep a waitlist</span>
          <span className="mt-0.5 block text-muted">
            When the event is full, extra sign-ups join a waitlist instead of being
            turned away.
          </span>
        </span>
      </label>

      {state?.error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          {pending ? "Saving…" : isEdit ? "Save changes" : "Create event"}
        </button>
        <Link
          href={`/o/${tenantSlug}`}
          className="text-sm text-muted underline-offset-4 transition-colors hover:text-fg hover:underline"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
