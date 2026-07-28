/** Values shared between the signup server actions and their UI.
 *  Kept out of the "use server" module, which may only export async functions. */

/** Carries the pending address to the check-email screen without putting PII in the URL. */
export const PENDING_EMAIL_COOKIE = "regista-pending-email";

export type SignupState = {
  error?: string;
  fieldErrors?: Partial<Record<"organization" | "slug" | "email" | "password", string>>;
};
