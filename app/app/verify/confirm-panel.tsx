"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { confirmVerification } from "./actions";
import type { ConfirmState } from "./shared";

export function ConfirmPanel({
  token,
  organizationName,
  address,
}: {
  token: string;
  organizationName: string;
  address: string;
}) {
  const [state, formAction, pending] = useActionState<ConfirmState | undefined, FormData>(
    confirmVerification,
    undefined,
  );
  const confirmed = state?.confirmed;

  // Once the token is spent, take it out of the address bar and out of history.
  // It is a single-use credential and has no business sitting in either.
  useEffect(() => {
    if (confirmed) window.history.replaceState({}, "", "/verify");
  }, [confirmed]);

  if (confirmed) {
    return (
      <>
        <span
          aria-hidden
          className="grid h-11 w-11 place-items-center rounded-xl border border-success/30 bg-success-bg"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5 text-success"
          >
            <path d="m20 6-11 11-5-5" />
          </svg>
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">
          {confirmed.tenantName} is live
        </h1>
        <p className="mt-2 text-sm text-muted">
          Your address is active. Sign in to publish your first event.
        </p>
        <div className="mt-8">
          <Link
            href="/login"
            className="inline-flex rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            Sign in to your dashboard
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <p className="font-mono text-xs uppercase tracking-widest text-faint">
        Confirm your email
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        Activate {organizationName}
      </h1>
      <p className="mt-2 text-sm text-muted">
        Confirming publishes your registration pages at{" "}
        <span className="font-mono text-fg">{address}</span>.
      </p>

      <form action={formAction} className="mt-8">
        <input type="hidden" name="token" value={token} />
        {state?.error ? (
          <p role="alert" className="mb-4 text-sm text-danger">
            {state.error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          {pending ? "Activating…" : "Confirm and activate"}
        </button>
      </form>
    </>
  );
}
