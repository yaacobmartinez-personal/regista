"use client";

import { useState, useTransition } from "react";
import { deleteEvent } from "./actions";

/**
 * Delete an event, then leave for the events list with a full navigation.
 *
 * The action is called imperatively (not as a form action) and awaited, so we
 * navigate the moment it returns. A form action would let Next refresh the
 * current route first — and since the event is now gone, that refresh renders
 * the not-found page and races the redirect. A server-action `redirect()` is no
 * good either: it misses the host → `/app` proxy rewrite (see the event form).
 */
export function DeleteEventButton({
  tenantSlug,
  eventId,
}: {
  tenantSlug: string;
  eventId: string;
}) {
  const [pending, start] = useTransition();
  const [leaving, setLeaving] = useState(false);

  const onDelete = () => {
    start(async () => {
      const formData = new FormData();
      formData.set("tenantSlug", tenantSlug);
      formData.set("eventId", eventId);
      const result = await deleteEvent(undefined, formData);
      if (result?.redirectTo) {
        setLeaving(true);
        window.location.assign(result.redirectTo);
      }
    });
  };

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={pending || leaving}
      className="rounded-lg border border-line-strong px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-panel disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
    >
      {pending || leaving ? "Deleting…" : "Delete"}
    </button>
  );
}
