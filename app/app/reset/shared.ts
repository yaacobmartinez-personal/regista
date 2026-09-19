/** Types shared between the reset action and its form.
 *  Kept out of the "use server" module, which may only export async functions. */

export type ResetState = {
  error?: string;
  fieldErrors?: { password?: string };
  /** Where to land once the password is set — a full navigation, via the proxy. */
  redirectTo?: string;
};
