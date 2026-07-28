"use client";

import { useActionState } from "react";
import { register } from "./actions";
import type { RegisterState } from "./shared";

const field =
  "rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm placeholder:text-faint focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25";

function Notice({
  tone,
  title,
  children,
}: {
  tone: "success" | "warn";
  title: string;
  children: React.ReactNode;
}) {
  const styles =
    tone === "success"
      ? "border-success/30 bg-success-bg"
      : "border-line-strong bg-panel";
  return (
    <div role="status" className={`rounded-xl border p-5 ${styles}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted">{children}</p>
    </div>
  );
}

export function RegisterForm({
  tenantSlug,
  eventSlug,
  isFull,
  waitlistEnabled,
}: {
  tenantSlug: string;
  eventSlug: string;
  isFull: boolean;
  waitlistEnabled: boolean;
}) {
  const [state, formAction, pending] = useActionState<RegisterState | undefined, FormData>(
    register,
    undefined,
  );

  if (state?.outcome === "confirmed") {
    return (
      <Notice tone="success" title="You're registered">
        We&apos;ve sent a confirmation to your email address.
      </Notice>
    );
  }
  if (state?.outcome === "waitlisted") {
    return (
      <Notice tone="warn" title="You're on the waitlist">
        This event is full. We&apos;ll email you if a place opens up.
      </Notice>
    );
  }
  if (state?.outcome === "duplicate") {
    return (
      <Notice tone="warn" title="You're already signed up">
        That email address is already registered for this event.
      </Notice>
    );
  }
  if (state?.outcome === "full") {
    return (
      <Notice tone="warn" title="This event is full">
        All places have been taken.
      </Notice>
    );
  }
  if (state?.outcome === "closed") {
    return (
      <Notice tone="warn" title="Registration is closed">
        This event isn&apos;t accepting sign-ups right now.
      </Notice>
    );
  }

  // Full with no waitlist: don't offer a form that can only fail.
  if (isFull && !waitlistEnabled) {
    return (
      <Notice tone="warn" title="This event is full">
        All places have been taken.
      </Notice>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="tenantSlug" value={tenantSlug} />
      <input type="hidden" name="eventSlug" value={eventSlug} />

      {isFull && waitlistEnabled ? (
        <p className="rounded-lg border border-line bg-panel px-4 py-3 text-sm text-muted">
          This event is full — sign up below to join the waitlist.
        </p>
      ) : null}

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Your name</span>
        <input name="name" required autoComplete="name" placeholder="Alex Doe" className={field} />
        {state?.fieldErrors?.name ? (
          <span className="text-xs text-red-600 dark:text-red-400">
            {state.fieldErrors.name}
          </span>
        ) : null}
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className={field}
        />
        {state?.fieldErrors?.email ? (
          <span className="text-xs text-red-600 dark:text-red-400">
            {state.fieldErrors.email}
          </span>
        ) : null}
      </label>

      {state?.error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        {pending ? "Signing you up…" : isFull ? "Join the waitlist" : "Register"}
      </button>

      <p className="text-xs text-muted">
        We collect your name and email only to manage your place at this event.
        The organizer can remove your details on request.
      </p>
    </form>
  );
}
