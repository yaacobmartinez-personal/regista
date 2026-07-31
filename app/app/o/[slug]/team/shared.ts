/** Types shared between the team server actions and their forms.
 *  Kept out of the "use server" module, which may only export async functions. */

export type InviteState = {
  error?: string;
  fieldErrors?: Partial<Record<"email" | "role", string>>;
  /** Set when an invitation was sent, so the form can confirm it. */
  invitedEmail?: string;
  /** Set when the address already belongs to someone on the team. */
  alreadyMember?: boolean;
};
