import Link from "next/link";
import { inspectVerification } from "@/lib/verification";
import { VERIFICATION_TTL_HOURS } from "@/lib/tokens";
import { rootDomain as configuredRootDomain } from "@/lib/urls";
import { Logo, Wordmark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { ConfirmPanel } from "./confirm-panel";

export const metadata = {
  title: "Verify your email — Regista",
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <Wordmark />
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-20">
        {children}
      </main>
    </div>
  );
}

/**
 * Rendering this page reads only — activation happens on an explicit action in
 * `ConfirmPanel`. Doing the write here would let anything that follows links in
 * a mailbox spend the token before the person saw it.
 */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const state = await inspectVerification(token);
  const rootDomain = configuredRootDomain();

  if (state.kind === "invalid") {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold tracking-tight">
          This link is no longer valid
        </h1>
        <p className="mt-2 text-sm text-muted">
          {`Verification links expire after ${VERIFICATION_TTL_HOURS} hours and can only be used once. Start again and we'll send a fresh one.`}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/login"
            className="rounded-lg border border-line-strong px-4 py-2.5 text-sm font-medium transition-colors hover:bg-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
          >
            Go to sign in
          </Link>
        </div>
      </Shell>
    );
  }

  if (state.kind === "active") {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold tracking-tight">
          {state.tenantName} is already verified
        </h1>
        <p className="mt-2 text-sm text-muted">
          Your address{" "}
          <span className="font-mono text-fg">
            {state.tenantSlug}.{rootDomain}
          </span>{" "}
          is active. Sign in to publish your first event.
        </p>
        <div className="mt-8">
          <Link
            href="/login"
            className="inline-flex rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            Sign in to your dashboard
          </Link>
        </div>
        <p className="mt-10 flex items-center gap-1.5 text-xs text-faint">
          <Logo className="!h-4 !w-4 !text-[10px]" />
          <span>Powered by Regista</span>
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <ConfirmPanel
        token={token!}
        organizationName={state.verification.tenantName}
        address={`${state.verification.tenantSlug}.${rootDomain}`}
      />
      <p className="mt-10 flex items-center gap-1.5 text-xs text-faint">
        <Logo className="!h-4 !w-4 !text-[10px]" />
        <span>Powered by Regista</span>
      </p>
    </Shell>
  );
}
