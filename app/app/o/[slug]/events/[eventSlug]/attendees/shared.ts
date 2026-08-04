/** Types shared between the attendee actions and the controls that call them.
 *  Kept out of the "use server" module, which may only export async functions. */

export type PromoteOutcome =
  | "promoted"
  /** The event is at capacity, so there is nowhere to promote them to. */
  | "full"
  /** Already promoted, cancelled, or removed since the page was rendered. */
  | "gone";

export type PromoteState = {
  outcome?: PromoteOutcome;
};
