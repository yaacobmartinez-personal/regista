import Link from "next/link";
import { requireMembership } from "@/lib/authz";
import { DashboardHeader } from "@/components/dashboard-header";

/**
 * Chrome for a tenant's dashboard. Layouts don't re-run on every client
 * navigation, so this is presentation only — each page performs its own
 * membership check.
 */
export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requireMembership(slug);

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader org={ctx.tenant} />

      <nav className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl gap-5 px-5">
          <Link
            href={`/o/${ctx.tenant.slug}`}
            className="border-b-2 border-accent py-3 text-sm font-semibold"
          >
            Events
          </Link>
          <span className="cursor-not-allowed py-3 text-sm text-faint" title="Coming in M4">
            Attendees
          </span>
          <span className="cursor-not-allowed py-3 text-sm text-faint" title="Coming in M6">
            Team
          </span>
        </div>
      </nav>

      {children}
    </div>
  );
}
