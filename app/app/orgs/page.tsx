import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { myMemberships, ROLE_LABEL } from "@/lib/authz";
import { DashboardHeader } from "@/components/dashboard-header";

/**
 * Organization chooser.
 *
 * Lives on its own path rather than the dashboard root: the root is the same
 * visible URL as the marketing home (they differ only by subdomain), and the
 * client router cache keys on that visible URL, so sharing it could serve the
 * landing page to a signed-in organizer.
 */
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
            {memberships.map((m) => {
              const pending = m.tenant.status !== "ACTIVE";
              const identity = (
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
              );

              // An unconfirmed organization isn't usable yet, so it is shown
              // with the reason rather than as a link that would 404.
              if (pending) {
                return (
                  <li
                    key={m.id}
                    className="rounded-xl border border-dashed border-line-strong bg-surface px-4 py-3.5"
                  >
                    <span className="flex items-center justify-between">
                      {identity}
                      <span className="rounded-full bg-panel px-2.5 py-1 font-mono text-xs uppercase text-muted">
                        Unconfirmed
                      </span>
                    </span>
                    <span className="mt-2 block text-xs text-muted">
                      Check your email for the confirmation link — this
                      organization goes live once the address is confirmed.
                    </span>
                  </li>
                );
              }

              return (
                <li key={m.id}>
                  <Link
                    href={`/o/${m.tenant.slug}`}
                    className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3.5 transition-colors hover:border-line-strong"
                  >
                    {identity}
                    <span className="rounded-full bg-panel px-2.5 py-1 font-mono text-xs uppercase text-muted">
                      {ROLE_LABEL[m.role]}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
