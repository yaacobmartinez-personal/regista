import { requireMembership } from "@/lib/authz";
import { inspectCheckIn } from "@/lib/checkin";
import { Logo, Wordmark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { ConfirmCheckIn } from "./confirm";

export const metadata = {
  title: "Check in — Regista",
  // A URL carrying a live ticket token has no business in a search index.
  robots: { index: false, follow: false },
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
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-16">
        {children}
        <p className="mt-10 flex items-center gap-1.5 text-xs text-faint">
          <Logo className="!h-4 !w-4 !text-[10px]" />
          <span>Powered by Regista</span>
        </p>
      </main>
    </div>
  );
}

/**
 * Where a ticket QR lands when scanned with a phone's own camera.
 *
 * Rendering only reads. The token names its organization, and we require the
 * viewer to be signed-in staff of it before showing anything — so this page is
 * useful to a doorperson and inert to anyone else. Marking present is a
 * deliberate button (see ConfirmCheckIn), never a side effect of loading.
 */
export default async function CheckInLandingPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c } = await searchParams;
  const view = await inspectCheckIn(c);

  if (!view) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold tracking-tight">
          This code isn&rsquo;t recognised
        </h1>
        <p className="mt-2 text-sm text-muted">
          The ticket may have been cancelled or removed. Ask the attendee for their
          most recent confirmation, or check them in from the dashboard.
        </p>
      </Shell>
    );
  }

  // Gate the page to staff of the ticket's organization.
  await requireMembership(view.tenantSlug);

  return (
    <Shell>
      <p className="font-mono text-xs uppercase tracking-widest text-faint">
        {view.tenantName} · check-in
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{view.eventTitle}</h1>
      <div className="mt-8">
        <ConfirmCheckIn
          token={c!}
          name={view.name}
          eventTitle={view.eventTitle}
          alreadyCheckedIn={view.checkedInAt !== null}
        />
      </div>
    </Shell>
  );
}
