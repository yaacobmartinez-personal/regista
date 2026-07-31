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
          {/* Team management is admin-only, so staff aren't shown a door they
              can't open. */}
          {ctx.role === "ADMIN" ? (
            <Link
              href={`/o/${ctx.tenant.slug}/team`}
              className="border-b-2 border-transparent py-3 text-sm text-muted transition-colors hover:text-fg"
            >
              Team
            </Link>
          ) : null}
        </div>
      </nav>

      {children}
    </div>
  );
}
