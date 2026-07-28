/** Types shared between the registration action and its form.
 *  Kept out of the "use server" module, which may only export async functions. */

export type RegisterOutcome =
  | "confirmed"
  | "waitlisted"
  | "duplicate"
  | "full"
  | "closed";

export type RegisterState = {
  outcome?: RegisterOutcome;
  error?: string;
  fieldErrors?: Partial<Record<"name" | "email", string>>;
};
