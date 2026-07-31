import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { Prisma, RegistrationStatus } from "@prisma/client";
import { requireMembership } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { formatInZone, zoneLabel } from "@/lib/time";
import { toggleCheckIn } from "./actions";
import { applyAttendeeFilter, clearAttendeeFilter } from "./filter-actions";
import { attendeeFilterCookie } from "./filter-shared";
import { EraseButton } from "./erase-button";

const PAGE_SIZE = 50;

// Registrations are only ever confirmed or waitlisted today; nothing writes
// CANCELLED, so offering it as a filter would return an empty list every time.
const STATUS_FILTERS = ["ALL", "CONFIRMED", "WAITLIST"] as const;

// Typed by the enum, so adding a status is a compile error here rather than a
// badge that silently renders with an undefined class.
const statusStyles: Record<RegistrationStatus, string> = {
  CONFIRMED: "bg-success-bg text-success",
  WAITLIST: "bg-panel text-muted",
  CANCELLED: "bg-panel text-faint",
};

/**
 * Shown in the event's own timezone, with the zone named.
 *
 * Plain `toLocaleString` renders in whatever zone the server process happens to
 * run in, unlabelled — so an organizer reading check-in times could be hours out
 * with nothing to tell them.
 */
function formatWhen(value: Date, timezone: string): string {
  return `${formatInZone(value, timezone, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })} ${zoneLabel(value, timezone)}`;
}

export default async function AttendeesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; eventSlug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug, eventSlug } = await params;
  const { page } = await searchParams;
  const ctx = await requireMembership(slug);

  const event = await prisma.event.findFirst({
    where: { tenantId: ctx.tenant.id, slug: eventSlug },
  });
  if (!event) notFound();

  // The search term is a person's name or email, so it lives in a cookie rather
  // than the query string — see filter-actions.ts. Only the page number, which
  // identifies nobody, stays in the URL.
  const jar = await cookies();
  const rawFilter = jar.get(attendeeFilterCookie(event.id))?.value;
  let search = "";
  let statusFilter: string = "ALL";
  if (rawFilter) {
    try {
      const parsed = JSON.parse(rawFilter) as { q?: string; status?: string };
      search = (parsed.q ?? "").trim();
      const candidate = parsed.status ?? "ALL";
      statusFilter = STATUS_FILTERS.includes(
        candidate as (typeof STATUS_FILTERS)[number],
      )
        ? candidate
        : "ALL";
    } catch {
      // Malformed cookie: fall back to no filter rather than failing the page.
    }
  }
  // Floored because a fractional page produces a non-integer offset, which the
  // database rejects. Clamped to the last page further down, once the total is
  // known, so an out-of-range value doesn't strand the reader on an empty list.
  const requestedPage = Math.max(1, Math.floor(Number(page)) || 1);

  const where: Prisma.RegistrationWhereInput = {
    tenantId: ctx.tenant.id,
    eventId: event.id,
    ...(statusFilter !== "ALL" ? { status: statusFilter as RegistrationStatus } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, confirmedCount, checkedInCount] = await Promise.all([
    prisma.registration.count({ where }),
    prisma.registration.count({
      where: { tenantId: ctx.tenant.id, eventId: event.id, status: "CONFIRMED" },
    }),
    prisma.registration.count({
      where: {
        tenantId: ctx.tenant.id,
        eventId: event.id,
        checkedInAt: { not: null },
      },
    }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, pageCount);

  const registrations = await prisma.registration.findMany({
    where,
    orderBy: { createdAt: "asc" },
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  const basePath = `/o/${ctx.tenant.slug}/events/${event.slug}/attendees`;
  // Only the page number goes in the link; the filter travels in the cookie, so
  // paging through results never writes anyone's name into a URL.
  const queryFor = (nextPage: number) =>
    nextPage > 1 ? `${basePath}?page=${nextPage}` : basePath;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">
      <Link
        href={`/o/${ctx.tenant.slug}/events/${event.slug}`}
        className="text-sm text-muted underline-offset-4 hover:text-fg hover:underline"
      >
        ← {event.title}
      </Link>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Attendees</h1>
          <p className="mt-1 font-mono text-xs tabular-nums text-muted">
            {confirmedCount} registered
            {event.capacity ? ` of ${event.capacity}` : ""} · {checkedInCount} checked in
          </p>
        </div>
        <a
          href={`${basePath}/export`}
          className="rounded-lg border border-line-strong px-4 py-2 text-sm font-medium transition-colors hover:bg-panel"
        >
          Export CSV
        </a>
      </div>

      <form action={applyAttendeeFilter} className="mt-6 flex flex-wrap items-center gap-2">
        <input type="hidden" name="tenantSlug" value={ctx.tenant.slug} />
        <input type="hidden" name="eventId" value={event.id} />
        <input
          name="q"
          defaultValue={search}
          placeholder="Search name or email"
          aria-label="Search attendees"
          className="min-w-56 flex-1 rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm placeholder:text-faint focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25"
        />
        <select
          name="status"
          defaultValue={statusFilter}
          aria-label="Filter by status"
          className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm focus-visible:border-accent focus-visible:outline-none"
        >
          <option value="ALL">All statuses</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="WAITLIST">Waitlist</option>
        </select>
        <button
          type="submit"
          className="rounded-lg border border-line-strong px-4 py-2 text-sm font-medium transition-colors hover:bg-panel"
        >
          Apply
        </button>
      </form>

      {search || statusFilter !== "ALL" ? (
        <form action={clearAttendeeFilter} className="mt-2">
          <input type="hidden" name="tenantSlug" value={ctx.tenant.slug} />
          <input type="hidden" name="eventId" value={event.id} />
          <button
            type="submit"
            className="text-sm text-muted underline-offset-4 hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
          >
            Clear filter
          </button>
        </form>
      ) : null}

      {registrations.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line-strong bg-surface p-10 text-center">
          <p className="text-sm text-muted">
            {total === 0 && !search && statusFilter === "ALL"
              ? "Nobody has registered yet."
              : "No attendees match that search."}
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th scope="col" className="px-5 py-3 font-medium text-muted">Name</th>
                <th scope="col" className="px-5 py-3 font-medium text-muted">Email</th>
                <th scope="col" className="px-5 py-3 font-medium text-muted">Status</th>
                <th scope="col" className="px-5 py-3 font-medium text-muted">Registered</th>
                <th scope="col" className="px-5 py-3 text-right font-medium text-muted">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {registrations.map((r) => {
                const erased = r.anonymizedAt !== null;
                // Row actions repeat down the page, so each needs a name of its
                // own — otherwise a screen reader hears "Check in, button" fifty
                // times with nothing to tell them apart.
                const attendeeLabel = erased
                  ? "an erased attendee"
                  : (r.name ?? r.email);
                return (
                  <tr key={r.id} className="border-b border-line last:border-b-0">
                    <td className="px-5 py-3">
                      {erased ? (
                        <span className="text-faint italic">Details erased</span>
                      ) : (
                        r.name
                      )}
                    </td>
                    <td className="px-5 py-3 text-muted">
                      {erased ? <span className="text-faint">—</span> : r.email}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 font-mono text-[11px] ${
                          statusStyles[r.status]
                        }`}
                      >
                        {r.status}
                      </span>
                      {r.checkedInAt ? (
                        <span className="ml-2 rounded-full bg-success-bg px-2.5 py-1 font-mono text-[11px] text-success">
                          CHECKED IN
                        </span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3 tabular-nums text-muted">
                      {formatWhen(r.createdAt, event.timezone)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <form action={toggleCheckIn}>
                          <input type="hidden" name="tenantSlug" value={ctx.tenant.slug} />
                          <input type="hidden" name="eventSlug" value={event.slug} />
                          <input type="hidden" name="registrationId" value={r.id} />
                          <input
                            type="hidden"
                            name="checkedIn"
                            value={r.checkedInAt ? "false" : "true"}
                          />
                          <button
                            type="submit"
                            aria-label={
                              r.checkedInAt
                                ? `Undo check-in for ${attendeeLabel}`
                                : `Check in ${attendeeLabel}`
                            }
                            className="rounded-lg border border-line-strong px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                          >
                            {r.checkedInAt ? "Undo check-in" : "Check in"}
                          </button>
                        </form>
                        {erased ? null : (
                          <EraseButton
                            tenantSlug={ctx.tenant.slug}
                            eventSlug={event.slug}
                            registrationId={r.id}
                            attendeeLabel={attendeeLabel}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted">
            Page {currentPage} of {pageCount} · {total} total
          </span>
          <span className="flex gap-2">
            {currentPage > 1 ? (
              <Link
                href={queryFor(currentPage - 1)}
                className="rounded-lg border border-line-strong px-3 py-1.5 transition-colors hover:bg-panel"
              >
                Previous
              </Link>
            ) : null}
            {currentPage < pageCount ? (
              <Link
                href={queryFor(currentPage + 1)}
                className="rounded-lg border border-line-strong px-3 py-1.5 transition-colors hover:bg-panel"
              >
                Next
              </Link>
            ) : null}
          </span>
        </div>
      ) : null}
    </main>
  );
}
