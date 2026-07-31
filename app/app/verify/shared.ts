/** Types shared between the verification action and its form.
 *  Kept out of the "use server" module, which may only export async functions. */

export type ConfirmState = {
  error?: string;
  /** Set once the organization is live, so the panel can show the result. */
  confirmed?: { tenantName: string; tenantSlug: string };
};
