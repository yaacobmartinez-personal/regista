"use client";

import { useActionState } from "react";
import { buttonPrimary } from "@/components/ui";
import { CheckInBanner } from "@/components/checkin-result";
import { confirmCheckIn } from "./actions";
import type { CheckInLandingState } from "./shared";

/**
 * The confirm step for a QR opened in a phone browser.
 *
 * The check-in only happens on this button, never on page load — so a link
 * preview or scanner bot that fetches the URL marks nobody present.
 */
export function ConfirmCheckIn({
  token,
  name,
  eventTitle,
  alreadyCheckedIn,
}: {
  token: string;
  name: string | null;
  eventTitle: string;
  alreadyCheckedIn: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    CheckInLandingState | undefined,
    FormData
  >(confirmCheckIn, undefined);

  if (state?.banner) {
    return (
      <CheckInBanner
        outcome={state.banner.outcome}
        name={state.banner.name}
        atIso={state.banner.atIso}
        eventTitle={state.banner.eventTitle}
      />
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="c" value={token} />
      <p className="text-sm text-muted">
        {alreadyCheckedIn ? (
          <>
            <span className="font-medium text-fg">{name ?? "This attendee"}</span> is
            already checked in for {eventTitle}.
          </>
        ) : (
          <>
            Check in{" "}
            <span className="font-medium text-fg">{name ?? "this attendee"}</span> for{" "}
            {eventTitle}?
          </>
        )}
      </p>
      <button type="submit" disabled={pending} className={`${buttonPrimary} mt-4`}>
        {pending ? "Checking…" : alreadyCheckedIn ? "Check again" : "Check in"}
      </button>
    </form>
  );
}
