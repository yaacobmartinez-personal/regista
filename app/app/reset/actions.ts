"use server";

import { z } from "zod";
import { signIn } from "@/lib/auth";
import { redeemPasswordReset } from "@/lib/accounts";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import type { ResetState } from "./shared";

const schema = z.object({
  token: z.string().trim().min(1),
  password: z.string().min(8, "Use at least 8 characters."),
});

/**
 * Set a new password from a reset link, and sign in.
 *
 * Signing in here is safe and saves a step: spending the link proves control of
 * the mailbox, which is a stronger claim than the password they have just
 * chosen. The destination is returned rather than redirected to, for the reason
 * `authenticate` explains — a redirect issued inside an action resolves against
 * the route tree and skips the subdomain rewrite.
 */
export async function resetPassword(
  _prev: ResetState | undefined,
  formData: FormData,
): Promise<ResetState> {
  const parsed = schema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues.find((i) => i.path[0] === "password");
    return issue
      ? { fieldErrors: { password: issue.message } }
      : { error: "This link is no longer valid." };
  }

  const ip = await clientIp();
  if (!rateLimit(`reset:ip:${ip}`, 10, 60 * 15).ok) {
    return { error: "Too many attempts. Try again in a few minutes." };
  }

  const reset = await redeemPasswordReset(parsed.data.token, parsed.data.password);
  if (!reset) return { error: "This link is no longer valid." };

  // The password was just set, so this cannot fail for a wrong one; if it fails
  // at all, the reset still stands and they can sign in by hand.
  try {
    await signIn("credentials", {
      email: reset.email,
      password: parsed.data.password,
      redirect: false,
    });
  } catch {
    return { redirectTo: "/login" };
  }

  return { redirectTo: "/orgs" };
}
