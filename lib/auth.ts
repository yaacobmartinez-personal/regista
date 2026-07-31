import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verify } from "@node-rs/argon2";
import { z } from "zod";
import { prisma } from "@/lib/db";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  // Behind local subdomains / proxies we trust the incoming host.
  trustHost: true,
  pages: { signIn: "/login" },
  // NOTE: cookies are intentionally host-only (no `domain` set), so the session
  // cookie is scoped to the `app.` dashboard subdomain where login happens and is
  // never sent to tenant public subdomains.
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (raw) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
        });
        if (!user?.passwordHash) return null;

        const ok = await verify(user.passwordHash, parsed.data.password);
        if (!ok) return null;

        // An address nobody has confirmed is not yet owned by anyone, so it
        // cannot be signed into. Without this, registering someone else's
        // address would hand you a working login for it — and lock them out,
        // since an unverified account can be claimed but not signed into.
        // Checked after the password verify so the response time doesn't
        // distinguish verified from unverified accounts.
        if (!user.emailVerified) return null;

        // Return identity only — authorization (memberships/roles) is resolved
        // from the DB per request in lib/authz.ts, never trusted from the token.
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    jwt: ({ token, user }) => {
      if (user) token.sub = user.id;
      return token;
    },
    session: ({ session, token }) => {
      if (token.sub && session.user) session.user.id = token.sub;
      return session;
    },
  },
});
