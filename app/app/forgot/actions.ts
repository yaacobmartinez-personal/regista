"use server";

import { z } from "zod";
import { requestPasswordReset } from "@/lib/accounts";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import type { ForgotState } from "./shared";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
});

/**
 * Ask for a password reset link.
 *
 * Answers `sent` whether or not the address has an account. The screen is seen
 * by whoever typed the address, not whoever owns it, so any difference between
 * "we sent one" and "no such account" would be a way to find out which
 * addresses are registered.
 */
export async function requestReset(
  _prev: ForgotState | undefined,
  formData: FormData,
): Promise<ForgotState> {
  const parsed = schema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { fieldErrors: { email: parsed.error.issues[0]?.message } };
  }

  const ip = await clientIp();
  const perAddress = rateLimit(`forgot:email:${parsed.data.email}`, 3, 60 * 15);
  const perSource = rateLimit(`forgot:ip:${ip}`, 10, 60 * 15);
  if (!perAddress.ok || !perSource.ok) {
    return { error: "Please wait a few minutes before requesting another email." };
  }

  await requestPasswordReset(parsed.data.email);
  return { sent: true };
}
