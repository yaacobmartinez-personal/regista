import { cookies } from "next/headers";
import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { VERIFICATION_TTL_HOURS } from "@/lib/tokens";
import { PENDING_EMAIL_COOKIE } from "../shared";
import { ResendButton } from "./resend-button";

export const metadata = {
  title: "Check your email — Regista",
};

export default async function CheckEmailPage() {
  const jar = await cookies();
  const email = jar.get(PENDING_EMAIL_COOKIE)?.value;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <Wordmark href="/" />
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-20">
        <span
          aria-hidden
          className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-surface"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5 text-accent"
          >
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 6 9-6" />
          </svg>
        </span>

        <h1 className="mt-5 text-2xl font-semibold tracking-tight">
          Check your email
        </h1>
        <p className="mt-2 text-sm text-muted">
          {email ? (
            <>
              We sent a confirmation link to{" "}
              <span className="font-medium text-fg">{email}</span>. Click it to
              activate your organization.
            </>
          ) : (
            <>
              We sent you a confirmation link. Click it to activate your
              organization.
            </>
          )}
        </p>
        <p className="mt-3 text-sm text-muted">
          {`The link expires in ${VERIFICATION_TTL_HOURS} hours. Until it's confirmed, your organization's pages stay offline.`}
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <ResendButton />
          <Link
            href="/signup"
            className="text-sm text-muted underline-offset-4 transition-colors hover:text-fg hover:underline"
          >
            Use a different address
          </Link>
        </div>
      </main>
    </div>
  );
}
