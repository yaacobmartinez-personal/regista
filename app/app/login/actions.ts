"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function authenticate(
  _prev: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  const email = String(formData.get("email") ?? "").toLowerCase();
  const password = String(formData.get("password") ?? "");

  try {
    // redirect:false so we can compute the destination ourselves below.
    await signIn("credentials", { email, password, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) {
      return "Invalid email or password.";
    }
    throw error;
  }

  // Signed in. Send a single-org user straight to their dashboard (an
  // unambiguous path); show the org picker only when there are 0 or several.
  // redirect() must stay outside the try so its control-flow throw propagates.
  const memberships = await prisma.membership.findMany({
    where: { user: { email } },
    include: { tenant: true },
    orderBy: { createdAt: "asc" },
  });

  if (memberships.length === 1) {
    redirect(`/o/${memberships[0].tenant.slug}`);
  }
  redirect("/");
}
