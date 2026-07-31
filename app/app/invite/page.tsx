import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ROLE_LABEL, ROLE_SUMMARY } from "@/lib/authz";
import {
  findLiveInvitation,
  invitedUserHasAccount,
  tenantJoinedWithToken,
} from "@/lib/invitations";
import { Wordmark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { signOutAction } from "../actions";
import { AcceptPanel, CreateAccountPanel } from "./accept-panels";

export const metadata = { title: "Join a team — Regista" };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <Wordmark />
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-16">
        {children}
      </main>
    </div>
  );
}

export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const invitation = await findLiveInvitation(token);
  const session = await auth();

  // Accepting re-renders this page, and by then the token is spent. Check
  // whether it was *this* visitor who spent it before calling the link dead.
  if (!invitation) {
    const joined = await tenantJoinedWithToken(token, session?.user?.id);
    if (joined) {
      return (
        <Shell>
          <p className="font-mono text-xs uppercase tracking-widest text-faint">
            Invitation accepted
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            You&apos;ve joined {joined.name}
          </h1>
          <p className="mt-2 text-sm text-muted">
            You now have access to this organization.
          </p>
          <div className="mt-8">
            <Link
              href={`/o/${joined.slug}`}
              className="inline-flex rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              Go to {joined.name}
            </Link>
          </div>
        </Shell>
      );
    }
  }

  if (!invitation || !token) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold tracking-tight">
          This invitation is no longer valid
        </h1>
        <p className="mt-2 text-sm text-muted">
          Invitations expire after a week and can only be used once. Ask whoever
          invited you to send a new one.
        </p>
        <div className="mt-8">
          <Link
            href="/login"
            className="rounded-lg border border-line-strong px-4 py-2.5 text-sm font-medium transition-colors hover:bg-panel"
          >
            Go to sign in
          </Link>
        </div>
      </Shell>
    );
  }

  const signedInUser = session?.user?.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { email: true },
      })
    : null;

  const summary = (
    <>
      <p className="font-mono text-xs uppercase tracking-widest text-faint">
        Invitation
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        Join {invitation.tenantName}
      </h1>
      <div className="mt-4 rounded-xl border border-line bg-surface p-4">
        <p className="font-mono text-[11px] uppercase tracking-wider text-faint">
          Your role
        </p>
        <p className="mt-1 text-sm font-medium">{ROLE_LABEL[invitation.role]}</p>
        <p className="mt-1 text-sm text-muted">{ROLE_SUMMARY[invitation.role]}</p>
      </div>
    </>
  );

  // Signed in as somebody else: don't silently attach the invitation to the
  // wrong account.
  if (signedInUser && signedInUser.email !== invitation.email) {
    return (
      <Shell>
        {summary}
        <p className="mt-6 text-sm text-muted">
          This invitation was sent to a different email address, and
          you&apos;re signed in as{" "}
          <span className="font-medium text-fg">{signedInUser.email}</span>.
          Sign out and open the link again from the invited inbox.
        </p>
        <form action={signOutAction} className="mt-8">
          <button
            type="submit"
            className="rounded-lg border border-line-strong px-4 py-2.5 text-sm font-medium transition-colors hover:bg-panel"
          >
            Sign out
          </button>
        </form>
      </Shell>
    );
  }

  if (signedInUser) {
    return (
      <Shell>
        {summary}
        <p className="mt-6 text-sm text-muted">
          Accepting as{" "}
          <span className="font-medium text-fg">{signedInUser.email}</span>.
        </p>
        <AcceptPanel token={token} />
      </Shell>
    );
  }

  // Not signed in. Existing account signs in first; a new colleague sets a
  // password here.
  if (await invitedUserHasAccount(invitation.email)) {
    return (
      <Shell>
        {summary}
        <p className="mt-6 text-sm text-muted">
          You already have a Regista account for{" "}
          <span className="font-medium text-fg">{invitation.email}</span>. Sign in,
          then open this link again to join.
        </p>
        <div className="mt-8">
          <Link
            href="/login"
            className="inline-flex rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover"
          >
            Sign in
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {summary}
      <CreateAccountPanel token={token} email={invitation.email} />
    </Shell>
  );
}
