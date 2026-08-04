import Link from "next/link";
import { notFound } from "next/navigation";
import { inspectRegistration } from "@/lib/registrations";
import { formatEventWhen } from "@/lib/time";
import { checkInUrl } from "@/lib/urls";
import { qrSvg } from "@/lib/qr";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonSecondary } from "@/components/ui";
import { CancelPanel } from "./cancel-panel";

export const metadata = {
  title: "Your registration",
  // A URL carrying a live credential has no business in a search index, and the
  // title stays generic so a preview never names who is going to what.
  robots: { index: false, follow: false },
};

function Shell({
  organizationName,
  children,
}: {
  organizationName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-3.5">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-panel text-sm font-semibold text-muted">
              {(organizationName ?? "?").charAt(0).toUpperCase()}
            </span>
            <span className="font-semibold tracking-tight">
              {organizationName ?? "Registration"}
            </span>
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 px-5 py-12">
        {children}
        <footer className="mt-16 flex items-center gap-1.5 border-t border-line pt-6 text-xs text-faint">
          <Logo className="!h-4 !w-4 !text-[10px]" />
          <span>Powered by Regista</span>
        </footer>
      </main>
    </div>
  );
}

/**
 * A registrant's view of their own place, reached from the link in their
 * confirmation email.
 *
 * Rendering only reads. Cancelling is an explicit action in `CancelPanel`, so a
 * mail client that follows links to build previews cannot give away somebody's
 * place on their behalf.
 */
export default async function ManageRegistrationPage({
  params,
  searchParams,
}: {
  params: Promise<{ domain: string; eventSlug: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { domain, eventSlug } = await params;
  const { token } = await searchParams;

  const registration = await inspectRegistration(token);

  // The token identifies the registration on its own, so the address it was
  // opened at has to agree with it — otherwise one organization's page would
  // render another's event under its own name and branding.
  if (
    !registration ||
    registration.tenantSlug !== domain ||
    registration.eventSlug !== eventSlug
  ) {
    if (!registration) {
      return (
        <Shell>
          <h1 className="text-2xl font-semibold tracking-tight">
            This link is no longer valid
          </h1>
          <p className="mt-2 text-sm text-muted">
            It may have been replaced by a newer confirmation, or the details
            behind it may have been removed at the attendee&rsquo;s request. Check
            the most recent email you received, or ask the organizer.
          </p>
        </Shell>
      );
    }
    notFound();
  }

  const cancelled = registration.status === "CANCELLED";
  const statusLabel = cancelled
    ? "Cancelled"
    : registration.status === "WAITLIST"
      ? "On the waitlist"
      : "Registered";

  // A ticket only makes sense for a confirmed place that hasn't been given up.
  // Waitlisted people have nothing to check in for yet; cancelled ones nothing at
  // all. `checkInToken` is only null on an erased record, which never reaches here.
  const ticketSvg =
    registration.status === "CONFIRMED" && registration.checkInToken
      ? await qrSvg(checkInUrl(registration.checkInToken))
      : null;

  return (
    <Shell organizationName={registration.tenantName}>
      <p className="font-mono text-xs uppercase tracking-widest text-faint">
        Your registration
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        {registration.eventTitle}
      </h1>
      <p className="mt-3 text-sm text-muted">
        {formatEventWhen(
          registration.startsAt,
          registration.endsAt,
          registration.timezone,
        )}
      </p>

      <dl className="mt-8 grid gap-px overflow-hidden rounded-xl border border-line bg-line text-sm">
        <div className="flex justify-between gap-4 bg-surface px-5 py-3.5">
          <dt className="text-muted">Status</dt>
          <dd className="font-medium">{statusLabel}</dd>
        </div>
        <div className="flex justify-between gap-4 bg-surface px-5 py-3.5">
          <dt className="text-muted">Name</dt>
          <dd className="font-medium">{registration.name ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-4 bg-surface px-5 py-3.5">
          <dt className="text-muted">Email</dt>
          <dd className="break-all font-medium">{registration.email}</dd>
        </div>
        <div className="flex justify-between gap-4 bg-surface px-5 py-3.5">
          <dt className="text-muted">Hosted by</dt>
          <dd className="font-medium">{registration.tenantName}</dd>
        </div>
      </dl>

      {ticketSvg ? (
        <div className="mt-6 flex flex-col items-center rounded-xl border border-line bg-surface px-5 py-6 text-center">
          <p className="text-sm font-medium">Your check-in code</p>
          <p className="mt-1 text-sm text-muted">
            Show this at the door — a member of {registration.tenantName} will
            scan it to check you in.
          </p>
          <div
            className="mt-4 h-44 w-44 [&>svg]:h-full [&>svg]:w-full"
            aria-label="Your check-in QR code"
            role="img"
            dangerouslySetInnerHTML={{ __html: ticketSvg }}
          />
        </div>
      ) : null}

      <div className="mt-6">
        {cancelled ? (
          <div className="rounded-xl border border-line bg-surface p-5">
            <p className="text-sm font-medium">
              You gave up this place.
            </p>
            <p className="mt-2 text-sm text-muted">
              If you can make it after all, sign up again on the event page —
              though the place may have gone to someone else by now.
            </p>
            <Link
              href={`/${registration.eventSlug}`}
              className={`${buttonSecondary} mt-4 inline-flex`}
            >
              Go to the event page
            </Link>
          </div>
        ) : registration.started ? (
          <div className="rounded-xl border border-line bg-surface p-5">
            <p className="text-sm text-muted">
              {registration.eventTitle} has already started, so this can no longer
              be cancelled here. Reply to your confirmation email if you need to
              reach {registration.tenantName}.
            </p>
          </div>
        ) : (
          <CancelPanel
            token={token!}
            eventTitle={registration.eventTitle}
            organizationName={registration.tenantName}
          />
        )}
      </div>

      <p className="mt-6 text-xs text-faint">
        To correct your details or have them removed entirely, reply to your
        confirmation email — {registration.tenantName} holds this guest list. How
        your data is handled is described in our{" "}
        <Link href="/privacy" className="underline underline-offset-2 hover:text-muted">
          privacy notice
        </Link>
        .
      </p>
    </Shell>
  );
}
