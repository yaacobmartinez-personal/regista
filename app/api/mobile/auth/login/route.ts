import { z } from "zod";
import { verify } from "@node-rs/argon2";
import { prisma } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { mintToken } from "@/lib/mobile-auth";
import { route, readJson, tooManyRequests, unauthorized, validationFailed } from "@/lib/api-response";

/**
 * E1 — sign in from the app.
 *
 * The web's equivalent is app/app/login/actions.ts, which hands the credentials
 * to NextAuth and gets a cookie back. A native client cannot use that cookie
 * (it is host-only for `app.<root>`), so this runs the same checks directly and
 * returns a bearer token instead. The checks and their order are deliberately
 * identical — see below.
 */

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export const POST = route(async (request: Request) => {
  const parsed = loginSchema.safeParse(await readJson(request));
  if (!parsed.success) throw validationFailed(parsed.error);
  const { email, password } = parsed.data;

  // Same two buckets and the same keys as the web action, so the limits are per
  // account and per source across both front ends rather than one budget each.
  // Argon2 is deliberately expensive, which makes an unlimited sign-in endpoint
  // a cheap way to burn the server's CPU as well as to guess passwords.
  const ip = await clientIp();
  const perAccount = rateLimit(`login:email:${email}`, 10, 15 * 60);
  const perSource = rateLimit(`login:ip:${ip}`, 30, 15 * 60);
  if (!perAccount.ok || !perSource.ok) {
    throw tooManyRequests("Too many sign-in attempts. Try again in a few minutes.");
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      passwordHash: true,
      emailVerified: true,
      tokenVersion: true,
    },
  });

  // One message for every failure. Naming the reason would turn this into a way
  // to find out which addresses have accounts.
  const wrong = unauthorized("Wrong email or password.");

  if (!user?.passwordHash) throw wrong;
  if (!(await verify(user.passwordHash, password))) throw wrong;

  // An address nobody has confirmed is not yet owned by anyone, so it cannot be
  // signed into (lib/auth.ts explains why at length). Checked after the password
  // verify, as it is there, so the response time does not distinguish a verified
  // account from an unverified one.
  if (!user.emailVerified) throw wrong;

  return Response.json({
    token: mintToken(user.id, user.tokenVersion),
    user: { id: user.id, email: user.email, name: user.name },
  });
});
