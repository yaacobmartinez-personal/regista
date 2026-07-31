import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Public not-found for a tenant subdomain. Reached for an unknown organization,
 * an unconfirmed one, or an event that isn't published — so it says only that
 * the page isn't there, without confirming which.
 */
export default function TenantNotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-3xl items-center justify-end px-5 py-3.5">
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-5 py-20">
        <h1 className="text-2xl font-semibold tracking-tight">
          This page isn&apos;t available
        </h1>
        <p className="mt-2 text-sm text-muted">
          The link may be wrong, or the event may have finished or been taken
          down. If someone sent you here, ask them for an up-to-date link.
        </p>
        <p className="mt-12 flex items-center gap-1.5 text-xs text-faint">
          <Logo className="!h-4 !w-4 !text-[10px]" />
          <span>Powered by Regista</span>
        </p>
      </main>
    </div>
  );
}
