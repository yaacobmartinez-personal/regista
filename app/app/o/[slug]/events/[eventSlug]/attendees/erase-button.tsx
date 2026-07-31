"use client";

import { useEffect, useRef, useState } from "react";
import { eraseRegistration } from "./actions";

/**
 * Erasing personal data is irreversible, so the control asks for confirmation
 * inline rather than firing on a single click.
 *
 * Both states carry the attendee's name in their accessible name: with fifty
 * rows on a page, "Erase, button" fifty times over tells a screen-reader user
 * nothing about what they are about to destroy. Focus is moved onto the confirm
 * button when it appears, because replacing the trigger would otherwise drop
 * focus to the top of the document with no announcement.
 */
export function EraseButton({
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
  const [confirming, setConfirming] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`Erase details for ${attendeeLabel}`}
        className="rounded-lg border border-line-strong px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-panel hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
      >
        Erase
      </button>
    );
  }

  return (
    <span
      role="group"
      aria-label={`Confirm erasing details for ${attendeeLabel}`}
      className="flex items-center gap-1.5"
    >
      <form action={eraseRegistration}>
        <input type="hidden" name="tenantSlug" value={tenantSlug} />
        <input type="hidden" name="eventSlug" value={eventSlug} />
        <input type="hidden" name="registrationId" value={registrationId} />
        <button
          ref={confirmRef}
          type="submit"
          aria-label={`Permanently erase details for ${attendeeLabel}`}
          className="rounded-lg bg-danger px-2.5 py-1.5 text-xs font-semibold text-surface transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
        >
          Erase details
        </button>
      </form>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        aria-label={`Keep details for ${attendeeLabel}`}
        className="rounded-lg border border-line-strong px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
      >
        Cancel
      </button>
    </span>
  );
}
