import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { myMemberships } from "@/lib/authz";
import { DashboardHeader } from "@/components/dashboard-header";

export default async function OrgPicker() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const memberships = await myMemberships();

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader />
      <main className="mx-auto w-full max-w-md flex-1 px-5 py-14">
        <p className="font-mono text-xs uppercase tracking-widest text-faint">
          Your organizations
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Choose an organization
        </h1>
        <p className="mt-1 text-sm text-muted">
          Signed in as {session.user.email}
        </p>

        {memberships.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-line-strong bg-surface p-8 text-center">
            <p className="text-sm text-muted">
              You don&apos;t belong to any organization yet.
            </p>
          </div>
        ) : (
          <ul className="mt-8 flex flex-col gap-2.5">
            {memberships.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/o/${m.tenant.slug}`}
                  className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3.5 transition-colors hover:border-line-strong"
                >
                  <span className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-panel text-sm font-semibold text-muted">
                      {m.tenant.name.charAt(0).toUpperCase()}
                    </span>
                    <span>
                      <span className="block text-sm font-medium">
                        {m.tenant.name}
                      </span>
                      <span className="block font-mono text-xs text-faint">
                        {m.tenant.slug}
                      </span>
                    </span>
                  </span>
                  <span className="rounded-full bg-panel px-2.5 py-1 font-mono text-xs uppercase text-muted">
                    {m.role}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
