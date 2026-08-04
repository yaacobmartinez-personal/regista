"use client";

import { useActionState, useState } from "react";
import { buttonDanger, buttonSecondary } from "@/components/ui";
import { cancelOwnRegistration } from "./actions";
import type { CancelState } from "./shared";

/**
 * The cancel control.
 *
 * Two steps, because there is no undo: cancelling frees the place immediately
 * and, if the event fills up behind them, the same person may not get it back.
 *
 * The token deliberately stays in the address bar afterwards. The verification
 * flow strips it because it is spent on use; this one is not — it is how the
 * registrant reaches their place at all, and clearing it would break a reload.
 */
export function CancelPanel({
  token,
  eventTitle,
  organizationName,
}: {
  token: string;
  eventTitle: string;
  organizationName: string;
}) {
  const [state, formAction, pending] = useActionState<CancelState | undefined, FormData>(
    cancelOwnRegistration,
    undefined,
  );
  const [confirming, setConfirming] = useState(false);

  if (state?.outcome === "cancelled" || state?.outcome === "already") {
    return (
      <div className="rounded-xl border border-line bg-surface p-5">
        <p className="text-sm font-medium">
          {state.outcome === "cancelled"
            ? "Your place has been given up."
            : "This place was already cancelled."}
        </p>
        <p className="mt-2 text-sm text-muted">
          {organizationName} can see that {eventTitle} has a place free. If you
          change your mind you can sign up again on the event page, though the
          place may have gone by then.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      {state?.error ? (
        <p role="alert" className="mb-3 text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {state?.outcome === "started" ? (
        <p role="alert" className="mb-3 text-sm text-danger">
          {eventTitle} has already started, so this can no longer be cancelled
          here. Reply to {organizationName} if you need to tell them something.
        </p>
      ) : null}
      {state?.outcome === "invalid" ? (
        <p role="alert" className="mb-3 text-sm text-danger">
          This link is no longer valid.
        </p>
      ) : null}

      {confirming ? (
        <>
          <p className="text-sm font-medium">Give up your place?</p>
          <p className="mt-2 text-sm text-muted">
            This frees your place for someone else. There is no undo — if the
            event fills up you may not get it back.
          </p>
          <form action={formAction} className="mt-4 flex flex-wrap gap-2">
            <input type="hidden" name="token" value={token} />
            <button type="submit" disabled={pending} className={buttonDanger}>
              {pending ? "Cancelling…" : "Yes, cancel my place"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className={buttonSecondary}
            >
              Keep my place
            </button>
          </form>
        </>
      ) : (
        <>
          <p className="text-sm font-medium">Can&rsquo;t make it?</p>
          <p className="mt-2 text-sm text-muted">
            Letting {organizationName} know frees your place for someone else.
          </p>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className={`${buttonSecondary} mt-4`}
          >
            Cancel my place
          </button>
        </>
      )}
    </div>
  );
}
