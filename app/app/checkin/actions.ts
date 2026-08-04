"use server";

import { requireMembership } from "@/lib/authz";
import { inspectCheckIn, performCheckIn } from "@/lib/checkin";
import type { CheckInLandingState } from "./shared";

/**
 * Perform a check-in reached by scanning a ticket QR with a phone camera.
 *
 * Runs only on this explicit submit, never on the page load that a link
 * prefetcher might trigger. The token names its own tenant; we require the
 * signed-in viewer to be a member of it, so scanning another organization's
 * ticket resolves to nothing rather than acting across a boundary.
 */
export async function confirmCheckIn(
  _prev: CheckInLandingState | undefined,
  formData: FormData,
): Promise<CheckInLandingState> {
  const token = String(formData.get("c") ?? "");

  const view = await inspectCheckIn(token);
  if (!view) return { banner: { outcome: "invalid" } };

  // Gates the action to staff of the ticket's organization (redirects to login
  // if signed out, not-found if signed in elsewhere).
  const ctx = await requireMembership(view.tenantSlug);

  const result = await performCheckIn(
    { tenantId: ctx.tenant.id, userId: ctx.userId },
    token,
  );

  return {
    banner: {
      outcome: result.outcome,
      name: result.name ?? null,
      atIso: result.at ? result.at.toISOString() : null,
      eventTitle: result.eventTitle ?? null,
    },
  };
}
