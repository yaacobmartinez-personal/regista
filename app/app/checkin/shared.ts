/** State shared between the QR-landing action and its client form.
 *  Kept out of the "use server" module, which may only export async functions. */

import type { CheckInOutcome } from "@/lib/checkin";

export type CheckInLandingState = {
  banner?: {
    outcome: CheckInOutcome;
    name?: string | null;
    atIso?: string | null;
    eventTitle?: string | null;
  };
};
