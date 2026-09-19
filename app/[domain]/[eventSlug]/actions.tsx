"use server";

import { revalidatePath } from "next/cache";
import { registrationInputSchema } from "@/lib/events";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { registerForEvent, registeredEventPath } from "@/lib/register";
import type { RegisterState } from "./shared";

/**
 * Register a member of the public for a published event.
 *
 * The place itself is taken by `registerForEvent` in lib/register.tsx, shared
 * with the mobile API so the capacity lock and waitlist rules have exactly one
 * implementation. This is the web's half: its rate limit, its own name-and-email
 * form (the app uses the signed-in account's verified address instead), and the
 * form state the page renders.
 */
export async function register(
  _prev: RegisterState | undefined,
  formData: FormData,
): Promise<RegisterState> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const eventSlug = String(formData.get("eventSlug") ?? "");

  const ip = await clientIp();
  const limit = rateLimit(`register:${ip}`, 20, 60 * 60);
  if (!limit.ok) {
    return { error: "Too many sign-ups from this connection. Try again shortly." };
  }

  const parsed = registrationInputSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
  });
  if (!parsed.success) {
    const fieldErrors: RegisterState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as "name" | "email";
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const { name, email } = parsed.data;
  const result = await registerForEvent({ tenantSlug, eventSlug, name, email });

  if (result.error) return { error: result.error };

  if (result.outcome === "confirmed" || result.outcome === "waitlisted") {
    // Server-resolved slug, not the one the form supplied.
    revalidatePath(registeredEventPath(tenantSlug, eventSlug));
  }

  return { outcome: result.outcome };
}
