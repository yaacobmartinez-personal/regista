import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Dashboard not-found.
 *
 * This is also the access-denied screen: `requireMembership` answers with
 * `notFound()` rather than a permission error so a URL can't be used to discover
 * which organizations exist. The wording therefore has to cover both cases
 * without implying which one applies.
 */
export default function DashboardNotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <Wordmark href="/orgs" />
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-20">
        <p className="font-mono text-xs uppercase tracking-widest text-faint">
          Not available
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          We couldn&apos;t find that
        </h1>
        <p className="mt-2 text-sm text-muted">
          It may have been removed, or it may belong to an organization you
          don&apos;t have access to. If you were expecting to see it, ask an admin
          of that organization to check your access.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/orgs"
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            Your organizations
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-line-strong px-4 py-2.5 text-sm font-medium transition-colors hover:bg-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
          >
            Sign in as someone else
          </Link>
        </div>
      </main>
    </div>
  );
}
