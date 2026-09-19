import Link from "next/link";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { PASSWORD_RESET_TTL_HOURS } from "@/lib/tokens";
import { ResetPanel } from "./reset-panel";

export const metadata = {
  title: "Choose a new password — Thingstead",
};

/**
 * Where a reset link lands.
 *
 * The token is not looked up here — rendering must not spend it, and a page
 * that said "this link is valid" before the submit would confirm a guess. An
 * unusable token is reported when the form is submitted, so a missing one is
 * the only thing this page can rule out on its own.
 */
export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="relative grid min-h-screen place-items-center bg-canvas px-4 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(120%_100%_at_50%_-10%,color-mix(in_srgb,var(--color-accent)_9%,transparent),transparent_60%)]"
      />
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="relative w-full max-w-sm rounded-2xl border border-line bg-surface p-8 shadow-sm">
        <div className="flex items-center gap-2">
          <Logo />
          <span className="font-semibold tracking-tight">Thingstead</span>
        </div>

        {token ? (
          <ResetPanel token={token} />
        ) : (
          <>
            <h1 className="mt-6 text-xl font-semibold tracking-tight">
              This link is no longer valid
            </h1>
            <p className="mt-2 text-sm text-muted">
              {`Reset links expire after ${PASSWORD_RESET_TTL_HOURS} hour${PASSWORD_RESET_TTL_HOURS === 1 ? "" : "s"} and can only be used once. Ask for a fresh one and we'll send it straight over.`}
            </p>
            <Link
              href="/forgot"
              className="mt-6 inline-flex rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              Send me a new link
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
