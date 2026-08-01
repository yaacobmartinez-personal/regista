import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { supportedTimeZones, utcToZonedInput } from "@/lib/time";
import { eventUrl, tenantHost } from "@/lib/urls";
import { EventForm } from "../event-form";
import { deleteEvent, setEventStatus } from "../actions";

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ slug: string; eventSlug: string }>;
}) {
  const { slug, eventSlug } = await params;
  const ctx = await requireMembership(slug);

  // Scoped by tenant as well as slug: an event id from another organization
  // must not resolve here.
  const event = await prisma.event.findFirst({
    where: { tenantId: ctx.tenant.id, slug: eventSlug },
  });
  if (!event) notFound();

  const publicHost = tenantHost(ctx.tenant.slug);
  const confirmed = await prisma.registration.count({
    where: { tenantId: ctx.tenant.id, eventId: event.id, status: "CONFIRMED" },
  });
  const waitlisted = await prisma.registration.count({
    where: { tenantId: ctx.tenant.id, eventId: event.id, status: "WAITLIST" },
  });

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{event.title}</h1>
          <p className="mt-1 text-sm text-muted">
            {event.status === "PUBLISHED" ? (
              <>
                Live at{" "}
                <a
                  href={eventUrl(ctx.tenant.slug, event.slug)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-accent underline-offset-4 hover:underline"
                >
                  {publicHost}/{event.slug}
                </a>
              </>
            ) : (
              <>This event is {event.status.toLowerCase()} and not accepting registrations.</>
            )}
          </p>
          <p className="mt-2 font-mono text-xs tabular-nums text-muted">
            {confirmed} registered
            {event.capacity ? ` of ${event.capacity}` : ""}
            {waitlisted > 0 ? ` · ${waitlisted} waitlisted` : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/o/${ctx.tenant.slug}/events/${event.slug}/attendees`}
            className="rounded-lg border border-line-strong px-3 py-2 text-sm font-medium transition-colors hover:bg-panel"
          >
            Attendees
          </Link>
          <form action={setEventStatus}>
            <input type="hidden" name="tenantSlug" value={ctx.tenant.slug} />
            <input type="hidden" name="eventId" value={event.id} />
            <input
              type="hidden"
              name="status"
              value={event.status === "PUBLISHED" ? "CLOSED" : "PUBLISHED"}
            />
            <button
              type="submit"
              className="rounded-lg border border-line-strong px-3 py-2 text-sm font-medium transition-colors hover:bg-panel"
            >
              {event.status === "PUBLISHED" ? "Close registrations" : "Publish"}
            </button>
          </form>

          {ctx.role === "ADMIN" ? (
            <form action={deleteEvent}>
              <input type="hidden" name="tenantSlug" value={ctx.tenant.slug} />
              <input type="hidden" name="eventId" value={event.id} />
              <button
                type="submit"
                className="rounded-lg border border-line-strong px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-panel"
              >
                Delete
              </button>
            </form>
          ) : null}
        </div>
      </div>

      <EventForm
        tenantSlug={ctx.tenant.slug}
        publicHost={publicHost}
        timeZones={supportedTimeZones()}
        event={{
          id: event.id,
          slug: event.slug,
          title: event.title,
          description: event.description,
          startsAtLocal: utcToZonedInput(event.startsAt, event.timezone),
          endsAtLocal: event.endsAt
            ? utcToZonedInput(event.endsAt, event.timezone)
            : null,
          timezone: event.timezone,
          capacity: event.capacity,
          waitlistEnabled: event.waitlistEnabled,
        }}
      />
    </main>
  );
}
