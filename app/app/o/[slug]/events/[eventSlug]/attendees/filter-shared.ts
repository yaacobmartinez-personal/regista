/** Values shared between the attendee filter actions and the page.
 *  Kept out of the "use server" module, which may only export async functions. */

export type AttendeeFilter = { q: string; status: string };

/** Per-event so filtering one guest list doesn't affect another. */
export function attendeeFilterCookie(eventId: string): string {
  return `regista-attendees-${eventId}`;
}

export const FILTER_COOKIE_MAX_AGE = 60 * 30;
