"use client";

import { useEffect } from "react";
import { Wordmark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Dashboard error boundary, so a thrown action shows the product rather than a
 * bare stack-trace shell. The message is deliberately generic: `error.message`
 * from the server is redacted in production anyway, and echoing it risks
 * surfacing internals.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error boundary:", error);
  }, [error]);

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
          Something went wrong
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          That didn&apos;t work
        </h1>
        <p className="mt-2 text-sm text-muted">
          The problem is on our side, not yours. Nothing you were working on has
          been lost — try again, and if it keeps happening give it a few minutes.
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-xs text-faint">
            Reference: {error.digest}
          </p>
        ) : null}
        <div className="mt-8">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            Try again
          </button>
        </div>
      </main>
    </div>
  );
}
