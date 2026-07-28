/** Types shared between the login action and its form.
 *  Kept out of the "use server" module, which may only export async functions. */

export type LoginState = {
  error?: string;
  /** Where to send the browser on success. */
  redirectTo?: string;
};
