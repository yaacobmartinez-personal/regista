"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
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

  // Two buckets: per address so one account can't be ground down from many
  // sources, and per source so one caller can't spray many accounts. Argon2 is
  // deliberately expensive, so an unlimited login endpoint is also a cheap way
  // to exhaust CPU.
  const ip = await clientIp();
  const perAccount = rateLimit(`login:email:${email}`, 10, 15 * 60);
  const perSource = rateLimit(`login:ip:${ip}`, 30, 15 * 60);
  if (!perAccount.ok || !perSource.ok) {
    return { error: "Too many sign-in attempts. Try again in a few minutes." };
  }

  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Invalid email or password." };
    }
    throw error;
  }

  // One usable organization: go straight to it. Otherwise offer the chooser,
  // which is also where an unconfirmed organization is explained — sending
  // someone straight to one would just 404.
  const memberships = await prisma.membership.findMany({
    where: { user: { email }, tenant: { status: "ACTIVE" } },
    include: { tenant: true },
    orderBy: { createdAt: "asc" },
  });

  return {
    redirectTo:
      memberships.length === 1 ? `/o/${memberships[0].tenant.slug}` : "/orgs",
  };
}
