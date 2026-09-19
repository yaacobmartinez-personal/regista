import Link from "next/link";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata = { title: "Privacy — Thingstead" };

/**
 * Platform privacy notice: what Thingstead itself holds and why.
 *
 * The per-organization notice (app/[domain]/privacy) covers what a registrant
 * gives an organizer, with the organizer as the controller. This page is the
 * other half — the accounts, tickets and organizer data Thingstead holds in
 * its own right — and is the single URL the app stores ask for. It is served
 * on the apex (`/privacy` is a reserved slug and a marketing segment, see
 * proxy.ts) so no organization can shadow it.
 */
export default function PlatformPrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-3.5">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo className="!h-8 !w-8" />
            <span className="font-semibold tracking-tight">Thingstead</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-14">
        <h1 className="text-3xl font-semibold tracking-tight">Privacy</h1>
        <p className="mt-3 text-sm text-muted">
          What Thingstead holds about you when you use the website or the app,
          and what you can do about it. Last updated 20 September 2026.
        </p>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Two kinds of information</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            When you register for an event, the organization running it holds
            your details and decides how they are used; Thingstead processes
            them on that organization&apos;s instructions. Each organization has
            its own notice at <code>thingstead.pro/&lt;organization&gt;/privacy</code>.
            This page covers everything else: the things Thingstead holds in its
            own right.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">What Thingstead holds</h2>
          <ul className="mt-2 flex flex-col gap-2 text-sm leading-relaxed text-muted">
            <li>
              <strong className="text-fg">Your account</strong> — name, email
              address, and a password hash if you set one. If you sign in with
              Google or Apple, the identifier they give us for you; never your
              password with them.
            </li>
            <li>
              <strong className="text-fg">Your tickets</strong> — which events
              you registered for, when, and whether you were checked in, so the
              app can show them to you.
            </li>
            <li>
              <strong className="text-fg">Organizer data</strong> — the
              organizations you belong to, your role in them, and the events,
              attendee lists and team invitations you create there.
            </li>
            <li>
              <strong className="text-fg">Sign-in records</strong> — a short-lived
              log of sign-in attempts by address, used only to slow down
              password guessing.
            </li>
          </ul>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Nothing else. No location, no contacts, no advertising identifiers,
            no analytics or tracking in the app or on this site. The app uses
            the camera only while you are scanning a ticket, and keeps no
            images.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Why</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            To run the service you asked for: keeping you signed in, showing
            your tickets at the door, letting organizers see who registered for
            their events, and sending the emails that confirm a registration or
            a sign-up. There is no other use.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Who else sees it</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Organizers see the name and email of people who register for{" "}
            <em>their</em> events, and nothing about anyone else. Two services
            handle data on Thingstead&apos;s behalf: Render, which hosts the
            application and its database, and Resend, which delivers email and
            receives your name and address for that purpose. Google and Apple
            see that you signed in with them, not what you do afterwards. Your
            details are never sold or shared with anyone else.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">How long it is kept</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            For as long as you have an account. Tickets stay attached to it so
            you can still see past events. Unconfirmed sign-ups and password
            reset links expire on their own within hours. If you delete your
            account, your name and email are cleared everywhere and cannot be
            recovered; anonymous attendance records remain so organizers&apos;
            numbers stay accurate.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">What you can ask for</h2>
          <ul className="mt-2 flex flex-col gap-2 text-sm leading-relaxed text-muted">
            <li>A copy of what is held about you.</li>
            <li>Correction of anything wrong — your name can be changed in the app.</li>
            <li>
              Deletion. In the app: Account → Delete account. On the website:
              Settings. This works straight away and does not need a request.
            </li>
            <li>To object to how your details are being used.</li>
          </ul>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            For anything the app cannot do itself, email{" "}
            <a href="mailto:privacy@thingstead.pro" className="text-fg underline">
              privacy@thingstead.pro
            </a>
            . If you aren&apos;t satisfied with the response, you can complain to
            your local data protection authority.
          </p>
        </section>

        <footer className="mt-14 flex items-center gap-1.5 border-t border-line pt-6 text-xs text-faint">
          <Logo className="!h-4 !w-4 !text-[10px]" />
          <span>Thingstead</span>
        </footer>
      </main>
    </div>
  );
}
