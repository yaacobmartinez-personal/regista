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
import { pruneInBackground } from "@/lib/retention";
import { appOrigin, tenantPublicBase } from "@/lib/urls";
import {
  createSecureToken,
  verificationExpiry,
  VERIFICATION_TTL_HOURS,
} from "@/lib/tokens";
import { sendTemplate } from "@/lib/email";
import { VerifyEmail, verifyEmailText } from "@/emails/verify-email";
import { PENDING_EMAIL_COOKIE, type SignupState } from "./shared";

const signupSchema = z.object({
  organization: z.string().trim().min(2, "Organization name is too short.").max(60),
  slug: z.string().trim().toLowerCase(),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters."),
});


async function sendVerification(opts: {
  email: string;
  organization: string;
  slug: string;
  tenantId: string;
}) {
  const { raw, hash: tokenHash } = createSecureToken();

  await prisma.verificationToken.create({
    data: {
      identifier: opts.email,
      token: tokenHash,
      tenantId: opts.tenantId,
      expiresAt: verificationExpiry(),
    },
  });

  const props = {
    organizationName: opts.organization,
    address: tenantPublicBase(opts.slug),
    verifyUrl: `${appOrigin()}/verify?token=${raw}`,
    expiryHours: VERIFICATION_TTL_HOURS,
  };

  await sendTemplate({
    to: opts.email,
    subject: `Confirm your email to activate ${opts.organization}`,
    template: <VerifyEmail {...props} />,
    text: verifyEmailText(props),
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

  // No scheduler in this deployment, so housekeeping rides along with a routine
  // write. Detached: it must never affect the signup itself.
  pruneInBackground();

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
    // Someone else may have claimed it in the meantime, or it may have gained
    // data since the check — either way the release declines and the address
    // stays taken rather than erroring.
    const released = await releaseAbandonedTenant(availability.tenantId);
    if (!released) {
      return { fieldErrors: { slug: "That address is already taken." } };
    }
  }

  // A confirmed account keeps its password: signing up with someone else's
  // address must never overwrite their credentials. An unverified account is
  // treated as unclaimed — nobody has proven control of that address, so the
  // password on it has no owner and whoever confirms the address next takes it.
  // That is what stops a stranger registering your address and locking you out.
  //
  // The response is identical in all three cases, so the form cannot be used to
  // probe for accounts. The hash is computed unconditionally to keep the timing
  // uniform too.
  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, emailVerified: true },
  });
  const passwordHash = await hash(password);
  const claimable = existingUser !== null && existingUser.emailVerified === null;

  let tenant;
  try {
    tenant = await prisma.$transaction(async (tx) => {
      const createdTenant = await tx.tenant.create({
        data: { slug, name: organization, status: "PENDING" },
      });

      const user = !existingUser
        ? await tx.user.create({ data: { email, passwordHash }, select: { id: true } })
        : claimable
          ? await tx.user.update({
              where: { id: existingUser.id },
              data: { passwordHash },
              select: { id: true },
            })
          : existingUser;

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

  // Set before sending. The organization is already committed, so if the mail
  // fails the person must still reach the check-your-email screen — that is
  // where "Resend" lives. Without the cookie they'd be stranded with their
  // chosen address reading "taken" for the next 24 hours.
  const jar = await cookies();
  jar.set(PENDING_EMAIL_COOKIE, email, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 30,
    path: "/",
  });

  try {
    await sendVerification({ email, organization, slug, tenantId: tenant.id });
  } catch {
    // The organization exists either way; the check-your-email screen offers a
    // resend, so send them there rather than to an error page.
    console.error("Verification email failed to send.");
  }

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
    try {
      await sendVerification({
        email,
        organization: membership.tenant.name,
        slug: membership.tenant.slug,
        tenantId: membership.tenantId,
      });
    } catch {
      return { sent: false, error: "We couldn't send the email just now. Try again shortly." };
    }
  }

  // Otherwise the same response whether or not anything was sent.
  return { sent: true };
}
