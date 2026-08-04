"use client";

import { useActionState } from "react";
import { buttonSmall } from "@/components/ui";
import { promoteRegistration } from "./actions";
import type { PromoteState } from "./shared";

/**
 * Move a waitlisted attendee into a confirmed place.
 *
 * Reports its own outcome rather than firing and forgetting: the promotion can
 * legitimately fail — the event may have filled up since the page was drawn —
 * and a button that appeared to work while nothing changed would leave an
 * organizer believing someone has a place they do not.
 *
 * The accessible name carries the attendee, since this control repeats down a
 * page of fifty rows.
 */
export function PromoteButton({
  tenantSlug,
  eventSlug,
  registrationId,
  attendeeLabel,
}: {
  tenantSlug: string;
  eventSlug: string;
  registrationId: string;
  attendeeLabel: string;
}) {
  const [state, formAction, pending] = useActionState<PromoteState | undefined, FormData>(
    promoteRegistration,
    undefined,
  );

  // A successful promotion re-renders the row as CONFIRMED, so the only states
  // worth reporting here are the ones where nothing happened.
  const problem =
    state?.outcome === "full"
      ? "Event is full"
      : state?.outcome === "gone"
        ? "No longer waitlisted"
        : null;

  return (
    <form action={formAction} className="flex items-center gap-1.5">
      <input type="hidden" name="tenantSlug" value={tenantSlug} />
      <input type="hidden" name="eventSlug" value={eventSlug} />
      <input type="hidden" name="registrationId" value={registrationId} />
      {problem ? (
        <span role="alert" className="text-xs text-danger">
          {problem}
        </span>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        aria-label={`Give ${attendeeLabel} a confirmed place`}
        className={`${buttonSmall} disabled:opacity-60`}
      >
        {pending ? "Promoting…" : "Promote"}
      </button>
    </form>
  );
}
