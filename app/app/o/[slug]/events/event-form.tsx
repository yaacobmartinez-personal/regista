"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
// The same function the server uses, so this preview can't promise a link the
// user won't get.
import { slugify as slugifyTitle } from "@/lib/slug";
import { createEvent, updateEvent } from "./actions";
import type { EventFormState } from "./shared";

export type EventFormValues = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  /** Wall-clock values already expressed in the event's own timezone. */
  startsAtLocal: string;
  endsAtLocal: string | null;
  timezone: string;
  capacity: number | null;
  waitlistEnabled: boolean;
};


const field =
  "rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm placeholder:text-faint focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25";
const errorText = "text-xs text-danger";

export function EventForm({
  tenantSlug,
  publicHost,
  timeZones,
  event,
}: {
  tenantSlug: string;
  publicHost: string;
  timeZones: string[];
  event?: EventFormValues;
}) {
  const isEdit = Boolean(event);
  const [state, formAction, pending] = useActionState<EventFormState | undefined, FormData>(
    isEdit ? updateEvent : createEvent,
    undefined,
  );

  // A full navigation, so the request passes through the host → `/app` rewrite
  // (a server-action redirect would land on the tenant "not available" page).
  const redirectTo = state?.redirectTo;
  useEffect(() => {
    if (redirectTo) window.location.assign(redirectTo);
  }, [redirectTo]);

  const [title, setTitle] = useState(event?.title ?? "");
  const [slug, setSlug] = useState(event?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(Boolean(event));
  const effectiveSlug = slugEdited ? slug : slugifyTitle(title);

  // For a new event, preselect the organizer's own zone once the control mounts.
  // Done through the ref rather than server-rendered so the markup stays stable.
  const zonePreselected = useRef(false);

  return (
    <form action={formAction} className="mt-8 flex max-w-xl flex-col gap-5">
      <input type="hidden" name="tenantSlug" value={tenantSlug} />
      {event ? <input type="hidden" name="eventId" value={event.id} /> : null}

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Title</span>
        <input
          name="title"
          aria-invalid={state?.fieldErrors?.title ? true : undefined}
          aria-describedby={state?.fieldErrors?.title ? "event-title-error" : undefined}
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Summer Meetup"
          className={field}
        />
        {state?.fieldErrors?.title ? (
          <span id="event-title-error" className={errorText}>{state.fieldErrors.title}</span>
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
            aria-invalid={state?.fieldErrors?.startsAt ? true : undefined}
            aria-describedby={state?.fieldErrors?.startsAt ? "event-startsat-error" : undefined}
            type="datetime-local"
            required
            defaultValue={event?.startsAtLocal ?? ""}
            className={field}
          />
          {state?.fieldErrors?.startsAt ? (
            <span id="event-startsat-error" className={errorText}>{state.fieldErrors.startsAt}</span>
          ) : null}
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">
            Ends <span className="font-normal text-faint">(optional)</span>
          </span>
          <input
            name="endsAt"
            aria-invalid={state?.fieldErrors?.endsAt ? true : undefined}
            aria-describedby={state?.fieldErrors?.endsAt ? "event-endsat-error" : undefined}
            type="datetime-local"
            defaultValue={event?.endsAtLocal ?? ""}
            className={field}
          />
          {state?.fieldErrors?.endsAt ? (
            <span id="event-endsat-error" className={errorText}>{state.fieldErrors.endsAt}</span>
          ) : null}
        </label>
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Timezone</span>
        <select
          name="timezone"
          aria-invalid={state?.fieldErrors?.timezone ? true : undefined}
          aria-describedby={state?.fieldErrors?.timezone ? "event-timezone-error" : undefined}
          defaultValue={event?.timezone ?? "UTC"}
          ref={(el) => {
            if (!el || zonePreselected.current) return;
            zonePreselected.current = true;
            if (event) return;
            const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
            if (local && timeZones.includes(local)) el.value = local;
          }}
          className={field}
        >
          {timeZones.map((zone) => (
            <option key={zone} value={zone}>
              {zone.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted">
          The times above are local to the event. Everyone sees them in this
          timezone, wherever they are.
        </span>
        {state?.fieldErrors?.timezone ? (
          <span id="event-timezone-error" className={errorText}>{state.fieldErrors.timezone}</span>
        ) : null}
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">
          Capacity <span className="font-normal text-faint">(optional)</span>
        </span>
        <input
          name="capacity"
          aria-invalid={state?.fieldErrors?.capacity ? true : undefined}
          aria-describedby={state?.fieldErrors?.capacity ? "event-capacity-error" : undefined}
          type="number"
          min={1}
          inputMode="numeric"
          defaultValue={event?.capacity ?? ""}
          placeholder="Leave empty for no limit"
          className={`${field} max-w-48`}
        />
        {state?.fieldErrors?.capacity ? (
          <span id="event-capacity-error" className={errorText}>{state.fieldErrors.capacity}</span>
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
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || Boolean(redirectTo)}
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          {pending || redirectTo ? "Saving…" : isEdit ? "Save changes" : "Create event"}
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
