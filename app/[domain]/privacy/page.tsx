import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveActiveTenant } from "@/lib/tenant";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata = { title: "How your details are used — Regista" };

/**
 * Per-organization privacy notice.
 *
 * Served under the tenant's own subdomain because the organization is the
 * controller for its registrants — Regista only processes on their behalf. The
 * page names them explicitly rather than leaving "we" ambiguous.
 */
export default async function TenantPrivacyPage({
  params,
}: {
  params: Promise<{ domain: string }>;
}) {
  const { domain } = await params;
  const tenant = await resolveActiveTenant(domain);
  if (!tenant) notFound();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-3.5">
          <Link href={`/${domain}`} className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-panel text-sm font-semibold text-muted">
              {tenant.name.charAt(0).toUpperCase()}
            </span>
            <span className="font-semibold tracking-tight">{tenant.name}</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-14">
        <h1 className="text-3xl font-semibold tracking-tight">
          How your details are used
        </h1>
        <p className="mt-3 text-sm text-muted">
          This covers the information you give when registering for an event run
          by {tenant.name}.
        </p>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Who holds your details</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            <strong className="text-fg">{tenant.name}</strong> decides what your
            details are used for and is responsible for them. Regista provides
            the software they use, and handles the information only on their
            instructions.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">What is collected, and why</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Your name and email address, given when you register. They are used
            to hold your place, send you a confirmation, and let the organizer
            manage the guest list on the day. Nothing else is collected — no
            tracking, no advertising, no profiling, and no analytics scripts on
            this page.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Who else sees it</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Organizers at {tenant.name}, and Resend, the service that delivers
            the confirmation email — it receives your name and address for that
            purpose. Your details are never sold or shared with anyone else, and
            never visible to another organization using Regista.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">How long it is kept</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Your registration is kept while the event is being run and
            afterwards for {tenant.name}&apos;s own records, until they remove
            it or you ask them to. There is currently no automatic deletion after
            an event, so if you want your details gone, ask.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">What you can ask for</h2>
          <ul className="mt-2 flex flex-col gap-2 text-sm leading-relaxed text-muted">
            <li>A copy of what is held about you.</li>
            <li>Correction of anything wrong.</li>
            <li>
              Deletion. Your name and email are cleared and cannot be recovered;
              an anonymous record remains so attendance numbers stay accurate.
            </li>
            <li>To object to how your details are being used.</li>
          </ul>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Ask {tenant.name} — replying to your confirmation email reaches them
            directly. If you aren&apos;t satisfied with the response, you can
            complain to your local data protection authority.
          </p>
        </section>

        <footer className="mt-14 flex items-center gap-1.5 border-t border-line pt-6 text-xs text-faint">
          <Logo className="!h-4 !w-4 !text-[10px]" />
          <span>Powered by Regista</span>
        </footer>
      </main>
    </div>
  );
}
