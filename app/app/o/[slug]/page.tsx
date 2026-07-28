import Link from "next/link";
import { requireMembership } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { setEventStatus } from "./events/actions";

function formatWhen(startsAt: Date): string {
  return startsAt.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const statusStyles: Record<string, string> = {
  PUBLISHED: "bg-success-bg text-success",
  DRAFT: "bg-panel text-muted",
  CLOSED: "bg-panel text-faint",
};

export default async function EventsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requireMembership(slug);

  const events = await prisma.event.findMany({
    where: { tenantId: ctx.tenant.id },
    orderBy: [{ startsAt: "asc" }],
  });

  // Confirmed registrations per event, in one query.
  const counts = await prisma.registration.groupBy({
    by: ["eventId"],
    where: { tenantId: ctx.tenant.id, status: "CONFIRMED" },
    _count: { _all: true },
  });
  const confirmedByEvent = new Map(counts.map((c) => [c.eventId, c._count._all]));

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
          <p className="mt-1 text-sm text-muted">
            Publish an event to open its registration page.
          </p>
        </div>
        <Link
          href={`/o/${ctx.tenant.slug}/events/new`}
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover"
        >
          New event
        </Link>
      </div>

      {events.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-line-strong bg-surface p-10 text-center">
          <p className="text-sm font-medium">No events yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            Create your first event, then publish it to start collecting
            registrations.
          </p>
        </div>
      ) : (
        <ul className="mt-8 overflow-hidden rounded-xl border border-line bg-surface">
          {events.map((event) => {
            const confirmed = confirmedByEvent.get(event.id) ?? 0;
            return (
              <li
                key={event.id}
                className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-5 py-4 last:border-b-0"
              >
                <div className="min-w-0">
                  <Link
                    href={`/o/${ctx.tenant.slug}/events/${event.slug}`}
                    className="text-sm font-medium underline-offset-4 hover:underline"
                  >
                    {event.title}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted">
                    {formatWhen(event.startsAt)}
                    {event.capacity ? ` · capacity ${event.capacity}` : " · no limit"}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs tabular-nums text-muted">
                    {event.capacity ? `${confirmed}/${event.capacity}` : confirmed}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 font-mono text-[11px] ${
                      statusStyles[event.status]
                    }`}
                  >
                    {event.status}
                  </span>
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
                      className="rounded-lg border border-line-strong px-3 py-1.5 text-xs font-medium transition-colors hover:bg-panel"
                    >
                      {event.status === "PUBLISHED" ? "Close" : "Publish"}
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
