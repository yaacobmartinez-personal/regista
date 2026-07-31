"use server";

import { hash } from "@node-rs/argon2";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { auth, signIn } from "@/lib/auth";
import { findLiveInvitation, redeemInvitation } from "@/lib/invitations";
import type { AcceptState } from "./shared";

/**
 * Redeeming a team invitation.
 *
 * Invitations are bound to the address they were sent to: holding the link is
 * not enough, the account accepting it must be that address.
 *
 * Destinations are returned rather than redirected to, because a redirect issued
 * inside a server action bypasses the subdomain rewrite in proxy.ts.
 */

const newAccountSchema = z.object({
  name: z.string().trim().min(1, "Tell us your name.").max(120),
  password: z.string().min(8, "Use at least 8 characters."),
});

/** Accept as the already-signed-in user. */
export async function acceptInvitation(
  _prev: AcceptState | undefined,
  formData: FormData,
): Promise<AcceptState> {
  const invitation = await findLiveInvitation(String(formData.get("token") ?? ""));
  if (!invitation) return { error: "This invitation is no longer valid." };

  const session = await auth();
  if (!session?.user?.id) return { error: "Sign in to accept this invitation." };

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true },
  });

  // The invitation belongs to an address, not to whoever opens the link.
  if (!user || user.email !== invitation.email) {
    return { error: "This invitation was sent to a different email address." };
  }

  await redeemInvitation(invitation, user.id);
  return { redirectTo: `/o/${invitation.tenantSlug}` };
}

/** Accept by creating the account the invitation was addressed to. */
export async function acceptWithNewAccount(
  _prev: AcceptState | undefined,
  formData: FormData,
): Promise<AcceptState> {
  const invitation = await findLiveInvitation(String(formData.get("token") ?? ""));
  if (!invitation) return { error: "This invitation is no longer valid." };

  const parsed = newAccountSchema.safeParse({
    name: formData.get("name"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    const fieldErrors: AcceptState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as "name" | "password";
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  // Never overwrite the password of an account whose owner has confirmed the
  // address. An unverified account is a different matter: nobody has proven
  // control of it, so following a link sent to that inbox is stronger evidence
  // of ownership than the password sitting on it, and the invitee claims it.
  const existing = await prisma.user.findUnique({
    where: { email: invitation.email },
    select: { id: true, passwordHash: true, emailVerified: true },
  });
  if (existing?.passwordHash && existing.emailVerified) {
    return { error: "An account already exists for this address. Sign in to accept." };
  }

  const passwordHash = await hash(parsed.data.password);
  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: { name: parsed.data.name, passwordHash, emailVerified: new Date() },
        select: { id: true },
      })
    : await prisma.user.create({
        data: {
          email: invitation.email,
          name: parsed.data.name,
          passwordHash,
          // Following a link sent to this address proves control of it.
          emailVerified: new Date(),
        },
        select: { id: true },
      });

  await redeemInvitation(invitation, user.id);

  await signIn("credentials", {
    email: invitation.email,
    password: parsed.data.password,
    redirect: false,
  });

  return { redirectTo: `/o/${invitation.tenantSlug}` };
}
