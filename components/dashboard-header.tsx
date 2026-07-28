import Link from "next/link";
import { signOutAction } from "@/app/app/actions";
import { ThemeToggle } from "@/components/theme-toggle";
import { Wordmark } from "@/components/brand";

export function DashboardHeader({
  org,
}: {
  org?: { name: string; slug: string };
}) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Wordmark href="/" />
          {org ? (
            <>
              <span className="text-faint" aria-hidden>
                /
              </span>
              <Link
                href="/"
                className="truncate rounded-lg border border-line px-2.5 py-1 text-sm font-medium transition-colors hover:border-line-strong"
              >
                {org.name}
              </Link>
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <form action={signOutAction}>
            <button
              type="submit"
              className="rounded-lg border border-line-strong px-3 py-2 text-sm font-medium transition-colors hover:bg-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
