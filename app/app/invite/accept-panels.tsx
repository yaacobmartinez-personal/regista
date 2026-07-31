"use client";

import { useActionState, useEffect } from "react";
import { acceptInvitation, acceptWithNewAccount } from "./actions";
import type { AcceptState } from "./shared";

const field =
  "rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm placeholder:text-faint focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25";
const primary =
  "rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";

/** A full navigation, so the request passes through the subdomain rewrite. */
function useRedirectOnSuccess(state: AcceptState | undefined) {
  const redirectTo = state?.redirectTo;
  useEffect(() => {
    if (redirectTo) window.location.assign(redirectTo);
  }, [redirectTo]);
  return Boolean(redirectTo);
}

/** The invited address is already signed in — one click to join. */
export function AcceptPanel({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<AcceptState | undefined, FormData>(
    acceptInvitation,
    undefined,
  );
  const leaving = useRedirectOnSuccess(state);

  return (
    <form action={formAction} className="mt-8">
      <input type="hidden" name="token" value={token} />
      {state?.error ? (
        <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending || leaving} className={primary}>
        {pending || leaving ? "Joining…" : "Accept invitation"}
      </button>
    </form>
  );
}

/** No account for the invited address yet — set a name and password. */
export function CreateAccountPanel({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const [state, formAction, pending] = useActionState<AcceptState | undefined, FormData>(
    acceptWithNewAccount,
    undefined,
  );
  const leaving = useRedirectOnSuccess(state);

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Email</span>
        <input
          value={email}
          readOnly
          aria-readonly
          className={`${field} cursor-not-allowed text-muted`}
        />
        <span className="text-xs text-muted">
          This invitation is tied to this address.
        </span>
      </label>

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
        <span className="font-medium">Choose a password</span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          className={field}
        />
        {state?.fieldErrors?.password ? (
          <span className="text-xs text-red-600 dark:text-red-400">
            {state.fieldErrors.password}
          </span>
        ) : null}
      </label>

      {state?.error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={pending || leaving} className={`${primary} mt-1`}>
        {pending || leaving ? "Creating your account…" : "Join the team"}
      </button>
    </form>
  );
}
