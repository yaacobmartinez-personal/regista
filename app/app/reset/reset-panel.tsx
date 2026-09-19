"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { resetPassword } from "./actions";
import type { ResetState } from "./shared";

/**
 * The form is a client component so the token can be posted on an explicit
 * submit. Spending it while rendering would let anything that follows links in
 * a mailbox burn the reset before the person saw the page.
 */
export function ResetPanel({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<ResetState | undefined, FormData>(
    resetPassword,
    undefined,
  );
  const redirectTo = state?.redirectTo;

  // A full navigation, so the request passes through the subdomain rewrite.
  useEffect(() => {
    if (redirectTo) window.location.assign(redirectTo);
  }, [redirectTo]);

  return (
    <>
      <h1 className="mt-6 text-xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="mt-1 text-sm text-muted">
        Setting it signs you out everywhere else.
      </p>

      <form action={formAction} className="mt-6 flex flex-col gap-4">
        <input type="hidden" name="token" value={token} />
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">New password</span>
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            className="rounded-lg border border-line-strong bg-canvas px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
          />
          {state?.fieldErrors?.password ? (
            <span className="text-xs text-danger">{state.fieldErrors.password}</span>
          ) : (
            <span className="text-xs text-faint">At least 8 characters.</span>
          )}
        </label>

        {state?.error ? (
          <p className="text-sm text-danger" role="alert">
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          {pending ? "Saving…" : "Save and sign in"}
        </button>

        <Link href="/forgot" className="text-center text-xs text-muted hover:text-fg">
          Send me a fresh link
        </Link>
      </form>
    </>
  );
}
