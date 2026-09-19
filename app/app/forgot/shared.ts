/** Types shared between the forgot-password action and its form.
 *  Kept out of the "use server" module, which may only export async functions. */

export type ForgotState = {
  error?: string;
  fieldErrors?: { email?: string };
  /** Set once the request has been taken, whatever the address turned out to be. */
  sent?: boolean;
};
