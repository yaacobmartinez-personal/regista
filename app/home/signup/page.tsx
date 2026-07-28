import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata = {
  title: "Create your organization — Regista",
};

export default function SignupPlaceholder() {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
  const proto = rootDomain.startsWith("localhost") ? "http" : "https";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <Wordmark href="/" />
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-20">
        <p className="font-mono text-xs uppercase tracking-widest text-faint">
          Coming next
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Self-serve signup is on the way.
        </h1>
        <p className="mt-3 text-muted">
          Creating an organization — claiming your address, verifying your email,
          and landing in your dashboard — ships in the next milestone.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/"
            className="rounded-lg border border-line-strong px-4 py-2.5 text-sm font-medium transition-colors hover:bg-panel"
          >
            ← Back home
          </Link>
          <a
            href={`${proto}://app.${rootDomain}/login`}
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover"
          >
            Organizer sign in
          </a>
        </div>
      </main>
    </div>
  );
}
