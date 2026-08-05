/** Types shared between the event server actions and their forms.
 *  Kept out of the "use server" module, which may only export async functions. */

export type EventFormState = {
  error?: string;
  /**
   * Where to send the browser on success. The form navigates here client-side
   * with a full load, because a server-action `redirect()` to a dashboard path
   * is resolved against the flat route tree and misses the host → `/app` proxy
   * rewrite — landing on the tenant "page not available" instead of the
   * dashboard. (Same reason the login flow navigates client-side.)
   */
  redirectTo?: string;
  fieldErrors?: Partial<
    Record<
      "title" | "slug" | "description" | "startsAt" | "endsAt" | "timezone" | "capacity",
      string
    >
  >;
};
