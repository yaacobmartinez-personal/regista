import { Wordmark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

export default function MarketingHome() {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
  const proto = rootDomain.startsWith("localhost") ? "http" : "https";
  const appUrl = `${proto}://app.${rootDomain}`;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-5 py-3.5">
          <Wordmark />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <a
              href={`${appUrl}/login`}
              className="rounded-lg border border-line-strong px-3 py-2 text-sm font-medium transition-colors hover:bg-panel"
            >
              Sign in
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-5 py-20">
        <p className="font-mono text-xs uppercase tracking-widest text-faint">
          Event registration platform
        </p>
        <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Every organization runs its own event registration.
        </h1>
        <p className="mt-5 max-w-prose text-lg text-muted">
          Give each organizer their own branded registration space — their own
          address, their own events, their own guest lists.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href={`${appUrl}/login`}
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover"
          >
            Organizer sign in
          </a>
          <span className="rounded-lg border border-line px-5 py-2.5 text-sm font-medium text-muted">
            Self-serve signup — coming soon
          </span>
        </div>
      </main>
    </div>
  );
}
