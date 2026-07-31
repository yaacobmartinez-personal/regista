/** Types shared between the invitation actions and their forms.
 *  Kept out of the "use server" module, which may only export async functions. */

export type AcceptState = {
  error?: string;
  fieldErrors?: Partial<Record<"name" | "password", string>>;
  /** Where to send the browser once the invitation is accepted. */
  redirectTo?: string;
};
