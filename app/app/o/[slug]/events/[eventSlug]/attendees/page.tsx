import Link from "next/link";
import { notFound } from "next/navigation";
import type { Prisma, RegistrationStatus } from "@prisma/client";
import { requireMembership } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { toggleCheckIn } from "./actions";
import { EraseButton } from "./erase-button";

const PAGE_SIZE = 50;

const STATUS_FILTERS = ["ALL", "CONFIRMED", "WAITLIST", "CANCELLED"] as const;

const statusStyles: Record<string, string> = {
  CONFIRMED: "bg-success-bg text-success",
  WAITLIST: "bg-panel text-muted",
  CANCELLED: "bg-panel text-faint",
};

function formatWhen(value: Date): string {
  return value.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AttendeesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; eventSlug: string }>;
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const { slug, eventSlug } = await params;
  const { q, status, page } = await searchParams;
  const ctx = await requireMembership(slug);

  const event = await prisma.event.findFirst({
    where: { tenantId: ctx.tenant.id, slug: eventSlug },
  });
  if (!event) notFound();

  const search = (q ?? "").trim();
  const statusFilter = STATUS_FILTERS.includes(
    (status ?? "ALL") as (typeof STATUS_FILTERS)[number],
  )
    ? (status ?? "ALL")
    : "ALL";
  const currentPage = Math.max(1, Number(page) || 1);

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

  const [total, registrations, confirmedCount, checkedInCount] = await Promise.all([
    prisma.registration.count({ where }),
    prisma.registration.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
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
  const basePath = `/o/${ctx.tenant.slug}/events/${event.slug}/attendees`;
  const queryFor = (nextPage: number) => {
    const sp = new URLSearchParams();
    if (search) sp.set("q", search);
    if (statusFilter !== "ALL") sp.set("status", statusFilter);
    if (nextPage > 1) sp.set("page", String(nextPage));
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

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

      <form method="get" className="mt-6 flex flex-wrap items-center gap-2">
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
          <option value="CANCELLED">Cancelled</option>
        </select>
        <button
          type="submit"
          className="rounded-lg border border-line-strong px-4 py-2 text-sm font-medium transition-colors hover:bg-panel"
        >
          Apply
        </button>
        {search || statusFilter !== "ALL" ? (
          <Link
            href={basePath}
            className="text-sm text-muted underline-offset-4 hover:text-fg hover:underline"
          >
            Clear
          </Link>
        ) : null}
      </form>

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
                <th className="px-5 py-3 font-medium text-muted">Name</th>
                <th className="px-5 py-3 font-medium text-muted">Email</th>
                <th className="px-5 py-3 font-medium text-muted">Status</th>
                <th className="px-5 py-3 font-medium text-muted">Registered</th>
                <th className="px-5 py-3 text-right font-medium text-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {registrations.map((r) => {
                const erased = r.anonymizedAt !== null;
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
                      {formatWhen(r.createdAt)}
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
                            className="rounded-lg border border-line-strong px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-panel"
                          >
                            {r.checkedInAt ? "Undo check-in" : "Check in"}
                          </button>
                        </form>
                        {erased ? null : (
                          <EraseButton
                            tenantSlug={ctx.tenant.slug}
                            eventSlug={event.slug}
                            registrationId={r.id}
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
