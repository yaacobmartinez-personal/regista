/** Types shared between the scanner action and its client component.
 *  Kept out of the "use server" module, which may only export async functions. */

import type { CheckInOutcome } from "@/lib/checkin";

export type ScanResult = {
  outcome: CheckInOutcome;
  name?: string | null;
  /** When they were checked in, ISO — present for "checked_in" and "already". */
  atIso?: string | null;
  /** For "wrong_event": the event the ticket actually belongs to. */
  eventTitle?: string;
};
