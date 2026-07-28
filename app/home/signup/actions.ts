"use server";

import { Prisma } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hash } from "@node-rs/argon2";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  isUsableSlug,
  isReservedSubdomain,
  slugAvailability,
  releaseAbandonedTenant,
} from "@/lib/tenant";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { createVerificationToken, verificationExpiry } from "@/lib/tokens";
import { sendEmail } from "@/lib/email";
import { PENDING_EMAIL_COOKIE, type SignupState } from "./shared";

const signupSchema = z.object({
  organization: z.string().trim().min(2, "Organization name is too short.").max(60),
  slug: z.string().trim().toLowerCase(),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters."),
});

function appOrigin(): string {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
  const proto = rootDomain.startsWith("localhost") ? "http" : "https";
  return `${proto}://app.${rootDomain}`;
}

async function sendVerification(opts: {
  email: string;
  organization: string;
  slug: string;
  tenantId: string;
}) {
  const { raw, hash: tokenHash } = createVerificationToken();

  await prisma.verificationToken.create({
    data: {
      identifier: opts.email,
      token: tokenHash,
      tenantId: opts.tenantId,
      expiresAt: verificationExpiry(),
    },
  });

  const link = `${appOrigin()}/verify?token=${raw}`;
  await sendEmail({
    to: opts.email,
    subject: `Verify your email to activate ${opts.organization}`,
    text: [
      `Welcome to Regista.`,
      ``,
      `Confirm this address to activate "${opts.organization}" at ${opts.slug}.`,
      ``,
      link,
      ``,
      `This link expires in 24 hours and can be used once.`,
      `If you didn't create this organization, you can ignore this email.`,
    ].join("\n"),
  });
}

/** Live availability check for the slug field. */
export async function checkSlug(
  slug: string,
): Promise<{ status: "available" | "taken" | "reserved" | "invalid" }> {
  const value = slug.trim().toLowerCase();
  if (!value) return { status: "invalid" };
  if (isReservedSubdomain(value)) return { status: "reserved" };
  if (!isUsableSlug(value)) return { status: "invalid" };

  // An abandoned signup's address is offered as available; it is released at
  // the moment someone actually claims it.
  const availability = await slugAvailability(value);
  return { status: availability.state === "taken" ? "taken" : "available" };
}

export async function signup(
  _prev: SignupState | undefined,
  formData: FormData,
): Promise<SignupState> {
  const ip = await clientIp();
  const limit = rateLimit(`signup:${ip}`, 5, 60 * 60);
  if (!limit.ok) {
    return { error: "Too many attempts. Try again in a little while." };
  }

  const parsed = signupSchema.safeParse({
    organization: formData.get("organization"),
    slug: formData.get("slug"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const fieldErrors: SignupState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof NonNullable<SignupState["fieldErrors"]>;
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const { organization, slug, email, password } = parsed.data;

  if (isReservedSubdomain(slug)) {
    return { fieldErrors: { slug: "That address isn't available." } };
  }
  if (!isUsableSlug(slug)) {
    return {
      fieldErrors: {
        slug: "Use 3–63 letters, numbers, or hyphens (start and end with a letter or number).",
      },
    };
  }

  const availability = await slugAvailability(slug);
  if (availability.state === "taken") {
    return { fieldErrors: { slug: "That address is already taken." } };
  }
  if (availability.state === "abandoned") {
    await releaseAbandonedTenant(availability.tenantId);
  }

  // An existing account keeps its password: signing up with someone else's
  // address must never overwrite their credentials, and the response below is
  // identical either way so the form cannot be used to probe for accounts.
  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  const passwordHash = existingUser ? null : await hash(password);

  let tenant;
  try {
    tenant = await prisma.$transaction(async (tx) => {
      const createdTenant = await tx.tenant.create({
        data: { slug, name: organization, status: "PENDING" },
      });

      const user = existingUser
        ? existingUser
        : await tx.user.create({
            data: { email, passwordHash: passwordHash! },
            select: { id: true },
          });

      await tx.membership.create({
        data: { userId: user.id, tenantId: createdTenant.id, role: "ADMIN" },
      });

      return createdTenant;
    });
  } catch (error) {
    // Someone claimed the address between the check above and this insert.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { fieldErrors: { slug: "That address was just taken. Try another." } };
    }
    throw error;
  }

  await sendVerification({ email, organization, slug, tenantId: tenant.id });

  const jar = await cookies();
  jar.set(PENDING_EMAIL_COOKIE, email, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 30,
    path: "/",
  });

  redirect("/signup/check-email");
}

export async function resendVerification(): Promise<{ sent: boolean; error?: string }> {
  const jar = await cookies();
  const email = jar.get(PENDING_EMAIL_COOKIE)?.value;
  if (!email) return { sent: false, error: "Start again from the signup form." };

  const ip = await clientIp();
  const limit = rateLimit(`resend:${ip}`, 3, 60 * 15);
  if (!limit.ok) {
    return { sent: false, error: "Please wait a few minutes before requesting another email." };
  }

  // Only ever re-send for a tenant that is still awaiting verification.
  const membership = await prisma.membership.findFirst({
    where: { user: { email }, tenant: { status: "PENDING" } },
    include: { tenant: true },
    orderBy: { createdAt: "desc" },
  });

  if (membership) {
    await sendVerification({
      email,
      organization: membership.tenant.name,
      slug: membership.tenant.slug,
      tenantId: membership.tenantId,
    });
  }

  // Same response whether or not anything was sent.
  return { sent: true };
}
