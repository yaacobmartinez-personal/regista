import { revalidatePath } from "next/cache";

/**
 * Refresh everywhere an event is visible.
 *
 * `revalidatePath` takes route-tree paths, i.e. the rewrite *destination* — so
 * the dashboard is `/app/o/...`, not the `/o/...` you see in the address bar.
 * Passing the visible path silently targeted a different route.
 *
 * Publishing or editing also changes the public pages, which were never being
 * refreshed at all: closing registrations left a working sign-up form up.
 *
 * Shared with the mobile API, which writes the same rows: an event published
 * from the app has to appear on the public site for the same reason one
 * published from the dashboard does.
 */
export function revalidateEventSurfaces(tenantSlug: string, eventSlug?: string) {
  revalidatePath(`/app/o/${tenantSlug}`);
  revalidatePath(`/${tenantSlug}`);
  if (eventSlug) revalidatePath(`/${tenantSlug}/${eventSlug}`);
}
