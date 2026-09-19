import { hash } from "@node-rs/argon2";
import { prisma } from "@/lib/db";
import { sendTemplate } from "@/lib/email";
import {
  PASSWORD_RESET_TTL_HOURS,
  VERIFICATION_TTL_HOURS,
  createSecureToken,
  hashToken,
  passwordResetExpiry,
  verificationExpiry,
} from "@/lib/tokens";
import { passwordResetUrl, verifyAccountUrl } from "@/lib/urls";
import { VerifyAccount, verifyAccountText } from "@/emails/verify-account";
import { ResetPassword, resetPasswordText } from "@/emails/reset-password";

/**
 * Personal accounts: signing up, confirming an address, and choosing a new
 * password.
 *
 * The web has only ever created an account as a side effect of creating an
 * organization. These are accounts with no organization behind them — someone
 * who installed the app to attend events — and the password reset the product
 * has never had at all.
 *
 * Every function here answers the same way whether or not the address exists.
 * An endpoint that said "no such account" would be a way to test addresses
 * against the user table, and the reply is visible to whoever typed the address
 * rather than to whoever owns it.
 */

/**
 * Create an account, or claim an unconfirmed one.
 *
 * A confirmed account keeps its password: signing up with someone else's
 * address must never overwrite their credentials. An unconfirmed account is
 * treated as unclaimed — nobody has proven control of that address, so the
 * password on it has no owner and whoever confirms the address next takes it.
 * That is what stops a stranger registering your address and locking you out.
 * The same rule the web signup applies.
 */
export async function signupAccount(input: {
  email: string;
  password: string;
  name: string;
}): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, emailVerified: true },
  });

  // Already confirmed: say nothing and do nothing. Telling the caller would
  // disclose that the address has an account; emailing the owner about a
  // sign-up attempt they did not make is noise they cannot act on.
  if (existing?.emailVerified) return;

  const passwordHash = await hash(input.password);

  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: { name, passwordHash },
        select: { id: true, name: true },
      })
    : await prisma.user.create({
        data: { email, name, passwordHash },
        select: { id: true, name: true },
      });

  // The account exists either way. A mail failure must not throw it away and
  // report a failed signup: retrying would find the address taken and fail the
  // same way, leaving them stuck with an account they cannot confirm. Resending
  // is the recovery path (#3), exactly as the web's check-your-email screen
  // offers one. This matters in more than theory — `sendEmail` throws rather
  // than logging when no mail provider is configured in production, which is
  // the state the deployment is in until a sending domain is verified.
  try {
    await sendAccountVerification(email, user.name);
  } catch {
    console.error("Account verification email failed to send.");
  }
}

/** Mint a fresh link and send it. Failures are the caller's to swallow or not. */
async function sendAccountVerification(email: string, name: string | null): Promise<void> {
  const token = createSecureToken();

  await prisma.verificationToken.create({
    data: {
      identifier: email,
      token: token.hash,
      // No organization to activate — this only confirms the address.
      tenantId: null,
      expiresAt: verificationExpiry(),
    },
  });

  const props = {
    name,
    verifyUrl: verifyAccountUrl(token.raw),
    expiryHours: VERIFICATION_TTL_HOURS,
  };

  await sendTemplate({
    to: email,
    subject: "Confirm your email",
    template: <VerifyAccount {...props} />,
    text: verifyAccountText(props),
  });
}

/**
 * Send the confirmation again.
 *
 * Only for an account that is still unconfirmed and has no organization — an
 * organization signup resends from its own flow, which has a name and an
 * address to talk about.
 */
export async function resendAccountVerification(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email: normalized },
    select: { id: true, name: true, emailVerified: true },
  });
  if (!user || user.emailVerified) return;

  try {
    await sendAccountVerification(normalized, user.name);
  } catch {
    // The caller answers identically either way, so a send failure must not
    // turn into a different reply and disclose that the address exists.
    console.error("Account verification email failed to send.");
  }
}

/**
 * Start a password reset.
 *
 * An account with no password — one created by a social sign-in, once that
 * exists — still gets a link: choosing a password is how it gains one, and
 * refusing here would say which accounts have passwords.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email: normalized },
    select: { id: true, name: true },
  });
  if (!user) return;

  const token = createSecureToken();

  await prisma.passwordResetToken.create({
    data: {
      identifier: normalized,
      token: token.hash,
      expiresAt: passwordResetExpiry(),
    },
  });

  const props = {
    name: user.name,
    resetUrl: passwordResetUrl(token.raw),
    expiryHours: PASSWORD_RESET_TTL_HOURS,
  };

  try {
    await sendTemplate({
      to: normalized,
      subject: "Choose a new Thingstead password",
      template: <ResetPassword {...props} />,
      text: resetPasswordText(props),
    });
  } catch {
    console.error("Password reset email failed to send.");
  }
}

export type ResetResult = { userId: string; email: string; tokenVersion: number };

/**
 * Spend a reset link and set the new password.
 *
 * Three things happen together, and all three matter:
 *
 * - Every other live reset link for the account is spent. Someone who asked
 *   twice, or whose mailbox was reachable an hour ago, must not still hold a
 *   second way in after the password has changed.
 * - The address is confirmed if it was not already. Receiving the link proves
 *   control of the mailbox, which is the same thing verification asks for.
 * - `tokenVersion` moves, which signs every mobile session out. A password
 *   change that left old sessions alive would be a surprise, and reset is what
 *   someone does when they think an account is compromised.
 */
export async function redeemPasswordReset(
  rawToken: string,
  newPassword: string,
): Promise<ResetResult | null> {
  const tokenHash = hashToken(rawToken);
  const passwordHash = await hash(newPassword);

  return prisma.$transaction(async (tx) => {
    const record = await tx.passwordResetToken.findUnique({ where: { token: tokenHash } });
    if (!record) return null;
    if (record.expiresAt.getTime() <= Date.now()) return null;

    // Claimed conditionally, so two redemptions of the same link produce one
    // password change rather than racing.
    const claimed = await tx.passwordResetToken.updateMany({
      where: { token: tokenHash, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) return null;

    const user = await tx.user.findUnique({
      where: { email: record.identifier },
      select: { id: true, email: true, emailVerified: true },
    });
    if (!user) return null;

    await tx.passwordResetToken.updateMany({
      where: { identifier: record.identifier, usedAt: null },
      data: { usedAt: new Date() },
    });

    const updated = await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        ...(user.emailVerified ? {} : { emailVerified: new Date() }),
        tokenVersion: { increment: 1 },
      },
      select: { id: true, email: true, tokenVersion: true },
    });

    return { userId: updated.id, email: updated.email, tokenVersion: updated.tokenVersion };
  });
}
