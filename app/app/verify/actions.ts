"use server";

import { redeemVerification } from "@/lib/verification";
import type { ConfirmState } from "./shared";

/**
 * Activate an organization from its verification link.
 *
 * Deliberately an action rather than something that happens while rendering the
 * link: a mail client or scanner prefetching the URL would otherwise spend the
 * token before the person clicked anything.
 */
export async function confirmVerification(
  _prev: ConfirmState | undefined,
  formData: FormData,
): Promise<ConfirmState> {
  const token = String(formData.get("token") ?? "");
  if (!token) return { error: "This link is no longer valid." };

  const result = await redeemVerification(token);
  if (!result) return { error: "This link is no longer valid." };

  return { confirmed: result };
}
