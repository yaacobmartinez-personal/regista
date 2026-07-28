"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { LoginState } from "./shared";

/**
 * Sign in and work out where to land.
 *
 * The destination is returned rather than passed to `redirect()`. Dashboard
 * routes are reached through a subdomain rewrite in `proxy.ts`, and a redirect
 * issued inside a server action is resolved against the route tree directly —
 * the rewrite never runs, so `/orgs` would not be found. Handing the path back
 * lets the browser navigate for real, which does go through the proxy.
 */
export async function authenticate(
  _prev: LoginState | undefined,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").toLowerCase();
  const password = String(formData.get("password") ?? "");

  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Invalid email or password." };
    }
    throw error;
  }

  // One organization: go straight to it. Otherwise offer the chooser.
  const memberships = await prisma.membership.findMany({
    where: { user: { email } },
    include: { tenant: true },
    orderBy: { createdAt: "asc" },
  });

  return {
    redirectTo:
      memberships.length === 1 ? `/o/${memberships[0].tenant.slug}` : "/orgs",
  };
}
