import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { resolveActiveTenant } from "@/lib/tenant";
import { seatsRemaining } from "@/lib/events";
import { formatEventWhen } from "@/lib/time";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { RegisterForm } from "./register-form";


export async function generateMetadata({
  params,
}: {
  params: Promise<{ domain: string; eventSlug: string }>;
}) {
  const { domain, eventSlug } = await params;
  const tenant = await resolveActiveTenant(domain);
  if (!tenant) return {};
  const event = await prisma.event.findFirst({
    where: { tenantId: tenant.id, slug: eventSlug, status: "PUBLISHED" },
    select: { title: true },
  });
  return event ? { title: `${event.title} — ${tenant.name}` } : {};
}

export default async function PublicEventPage({
  params,
}: {
  params: Promise<{ domain: string; eventSlug: string }>;
}) {
  const { domain, eventSlug } = await params;

  const tenant = await resolveActiveTenant(domain);
  if (!tenant) notFound();

  // Only published events are reachable publicly; drafts and closed events 404.
  const event = await prisma.event.findFirst({
    where: { tenantId: tenant.id, slug: eventSlug, status: "PUBLISHED" },
  });
  if (!event) notFound();

  const confirmed = await prisma.registration.count({
    where: { tenantId: tenant.id, eventId: event.id, status: "CONFIRMED" },
  });
  const remaining = seatsRemaining(event.capacity, confirmed);
  const isFull = remaining !== null && remaining === 0;

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

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-12">
        <div className="grid gap-10 md:grid-cols-[1.2fr_1fr] md:gap-12">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{event.title}</h1>
            <p className="mt-3 text-sm text-muted">
              {formatEventWhen(event.startsAt, event.endsAt, event.timezone)}
            </p>

            {event.capacity !== null ? (
              <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 font-mono text-xs text-muted">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isFull ? "bg-faint" : "bg-success"
                  }`}
                  aria-hidden
                />
                {isFull
                  ? "Full"
                  : `${remaining} of ${event.capacity} place${remaining === 1 ? "" : "s"} left`}
              </p>
            ) : null}

            {event.description ? (
              <div className="mt-6 whitespace-pre-line text-sm leading-relaxed text-muted">
                {event.description}
              </div>
            ) : null}
          </div>

          <div className="md:pt-1">
            <RegisterForm
              tenantSlug={tenant.slug}
              eventSlug={event.slug}
              organizationName={tenant.name}
              isFull={isFull}
              waitlistEnabled={event.waitlistEnabled}
            />
          </div>
        </div>

        <footer className="mt-16 flex items-center gap-1.5 border-t border-line pt-6 text-xs text-faint">
          <Logo className="!h-4 !w-4 !text-[10px]" />
          <span>Powered by Thingstead</span>
        </footer>
      </main>
    </div>
  );
}
