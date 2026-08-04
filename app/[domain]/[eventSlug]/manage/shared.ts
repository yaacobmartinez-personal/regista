/** Types shared between the cancel action and its form.
 *  Kept out of the "use server" module, which may only export async functions. */

import type { CancelOutcome } from "@/lib/registrations";

export type CancelState = {
  outcome?: CancelOutcome;
  error?: string;
};
