"use server";

import { revalidatePath } from "next/cache";
import { cancelRegistration } from "@/lib/registrations";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import type { CancelState } from "./shared";

/**
 * Give up a place, from the link in the confirmation email.
 *
 * A Server Action rather than anything reachable by GET: rendering the page must
 * stay read-only, or a mail client that prefetches links would cancel people's
 * places for them.
 */
export async function cancelOwnRegistration(
  _prev: CancelState | undefined,
  formData: FormData,
): Promise<CancelState> {
  const token = String(formData.get("token") ?? "");

  // The token is unguessable, so this is not protecting the registration itself
  // — it caps how fast a stolen mailbox or a leaked link can be used to churn
  // through an event, and stops the endpoint being a free lookup oracle.
  const ip = await clientIp();
  const limit = rateLimit(`cancel:${ip}`, 20, 60 * 60);
  if (!limit.ok) {
    return { error: "Too many attempts from this connection. Try again shortly." };
  }

  const { outcome, registration } = await cancelRegistration(token);

  if (outcome === "cancelled" && registration) {
    // The public event page shows how many places are left, and one just came
    // free.
    revalidatePath(`/${registration.tenantSlug}/${registration.eventSlug}`);
  }

  return { outcome };
}
