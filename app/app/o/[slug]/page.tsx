import { requireMembership } from "@/lib/authz";
import { DashboardHeader } from "@/components/dashboard-header";

export default async function OrgDashboard({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // Gates on DB-checked membership. Non-members / cross-tenant access -> notFound.
  const ctx = await requireMembership(slug);

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader org={ctx.tenant} />

      {/* Section nav — Attendees/Team/Settings land in later milestones. */}
      <nav className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl gap-1 px-5">
          <span className="border-b-2 border-accent py-3 text-sm font-semibold">
            Events
          </span>
          <span className="cursor-not-allowed py-3 pl-4 text-sm text-faint">
            Attendees
          </span>
          <span className="cursor-not-allowed py-3 pl-4 text-sm text-faint">
            Team
          </span>
        </div>
      </nav>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
            <p className="mt-1 text-sm text-muted">
              You are{" "}
              <span className="font-mono uppercase text-fg">{ctx.role}</span> in{" "}
              <span className="font-mono">{ctx.tenant.slug}</span>.
            </p>
          </div>
          <button
            type="button"
            disabled
            title="Coming in a later milestone"
            className="cursor-not-allowed rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent opacity-60"
          >
            + New event
          </button>
        </div>

        <div className="mt-8 rounded-xl border border-dashed border-line-strong bg-surface p-10 text-center">
          <p className="text-sm font-medium">No events yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            Event creation, public registration, attendees, and team management
            arrive in the next milestones. This is the M1 dashboard shell.
          </p>
        </div>
      </main>
    </div>
  );
}
