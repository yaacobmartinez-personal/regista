"use client";

import { useState } from "react";
import { eraseRegistration } from "./actions";

/**
 * Erasing personal data is irreversible, so the control asks for confirmation
 * inline rather than firing on a single click.
 */
export function EraseButton({
  tenantSlug,
  eventSlug,
  registrationId,
}: {
  tenantSlug: string;
  eventSlug: string;
  registrationId: string;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-lg border border-line-strong px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-panel hover:text-fg"
      >
        Erase
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1.5">
      <form action={eraseRegistration}>
        <input type="hidden" name="tenantSlug" value={tenantSlug} />
        <input type="hidden" name="eventSlug" value={eventSlug} />
        <input type="hidden" name="registrationId" value={registrationId} />
        <button
          type="submit"
          className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700"
        >
          Erase details
        </button>
      </form>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="rounded-lg border border-line-strong px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-panel"
      >
        Cancel
      </button>
    </span>
  );
}
