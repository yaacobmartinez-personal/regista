import { requireMembership } from "@/lib/authz";
import { DashboardHeader } from "@/components/dashboard-header";
import { DashboardNav } from "@/components/dashboard-nav";

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
      {/* Team management is admin-only, so staff aren't shown a door they
          can't open. */}
      <DashboardNav tenantSlug={ctx.tenant.slug} showTeam={ctx.role === "ADMIN"} />
      {children}
    </div>
  );
}
