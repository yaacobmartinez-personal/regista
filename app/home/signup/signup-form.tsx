"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
// Shared with the server, so the address previewed here is the one applied.
import { slugify } from "@/lib/slug";
import { checkSlug, signup } from "./actions";
import type { SignupState } from "./shared";

type SlugStatus = "idle" | "checking" | "available" | "taken" | "reserved" | "invalid";


const fieldClass =
  "rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm placeholder:text-faint focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25";

export function SignupForm({ rootDomain }: { rootDomain: string }) {
  const [state, formAction, pending] = useActionState<SignupState | undefined, FormData>(
    signup,
    undefined,
  );

  const [organization, setOrganization] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [slugStatus, setSlugStatus] = useState<SlugStatus>("idle");
  const [, startCheck] = useTransition();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mirror the name into the address until the user takes over that field.
  const effectiveSlug = slugEdited ? slug : slugify(organization);

  /** Debounce availability lookups; driven by the change handlers, not an effect. */
  function scheduleSlugCheck(value: string) {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!value) {
      setSlugStatus("idle");
      return;
    }
    setSlugStatus("checking");
    timerRef.current = setTimeout(() => {
      startCheck(async () => {
        const { status } = await checkSlug(value);
        setSlugStatus(status);
      });
    }, 400);
  }

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const slugMessage: Record<SlugStatus, string | null> = {
    idle: null,
    checking: "Checking availability…",
    available: "Available",
    taken: "That address is already taken.",
    reserved: "That address isn't available.",
    invalid: "Use 3–63 letters, numbers, or hyphens.",
  };
  const slugTone =
    slugStatus === "available"
      ? "text-success"
      : slugStatus === "checking" || slugStatus === "idle"
        ? "text-faint"
        : "text-danger";

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Organization name</span>
        <input
          name="organization"
          required
          value={organization}
          onChange={(e) => {
            setOrganization(e.target.value);
            if (!slugEdited) scheduleSlugCheck(slugify(e.target.value));
          }}
          placeholder="Acme Events"
          aria-invalid={state?.fieldErrors?.organization ? true : undefined}
          aria-describedby={
            state?.fieldErrors?.organization ? "signup-organization-error" : undefined
          }
          className={fieldClass}
        />
        {state?.fieldErrors?.organization ? (
          <span id="signup-organization-error" className="text-xs text-danger">
            {state.fieldErrors.organization}
          </span>
        ) : null}
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Your address</span>
        <span className="flex items-stretch">
          <input
            name="slug"
            required
            value={effectiveSlug}
            onChange={(e) => {
              const next = slugify(e.target.value);
              setSlugEdited(true);
              setSlug(next);
              scheduleSlugCheck(next);
            }}
            placeholder="acme"
            aria-describedby="slug-status"
            aria-invalid={
              state?.fieldErrors?.slug || slugStatus === "taken" || slugStatus === "reserved"
                ? true
                : undefined
            }
            className={`${fieldClass} w-full rounded-r-none`}
          />
          <span className="grid place-items-center rounded-r-lg border border-l-0 border-line-strong bg-panel px-3 font-mono text-xs text-muted">
            .{rootDomain}
          </span>
        </span>
        <span id="slug-status" className={`text-xs ${slugTone}`}>
          {state?.fieldErrors?.slug ?? slugMessage[slugStatus] ?? " "}
        </span>
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Your email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          aria-invalid={state?.fieldErrors?.email ? true : undefined}
          aria-describedby={state?.fieldErrors?.email ? "signup-email-error" : undefined}
          className={fieldClass}
        />
        {state?.fieldErrors?.email ? (
          <span id="signup-email-error" className="text-xs text-danger">
            {state.fieldErrors.email}
          </span>
        ) : null}
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Password</span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          aria-invalid={state?.fieldErrors?.password ? true : undefined}
          aria-describedby={
            state?.fieldErrors?.password ? "signup-password-error" : undefined
          }
          className={fieldClass}
        />
        {state?.fieldErrors?.password ? (
          <span id="signup-password-error" className="text-xs text-danger">
            {state.fieldErrors.password}
          </span>
        ) : null}
      </label>

      {state?.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || slugStatus === "taken" || slugStatus === "reserved"}
        className="mt-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        {pending ? "Creating…" : "Create organization"}
      </button>

      <p className="text-xs text-muted">
        By creating an organization you agree to handle your attendees&apos; data
        responsibly.
      </p>
    </form>
  );
}
