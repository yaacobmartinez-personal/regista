/** Types shared between the event server actions and their forms.
 *  Kept out of the "use server" module, which may only export async functions. */

export type EventFormState = {
  error?: string;
  fieldErrors?: Partial<
    Record<"title" | "slug" | "description" | "startsAt" | "endsAt" | "capacity", string>
  >;
};
