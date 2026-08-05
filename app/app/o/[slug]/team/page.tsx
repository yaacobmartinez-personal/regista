import { requireMembership, ROLE_LABEL, ROLE_SUMMARY } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { formatInZone } from "@/lib/time";
import { InviteForm } from "./invite-form";
import { changeRole, removeMember, revokeInvitation } from "./actions";

export const metadata = { title: "Team — Thingstead" };

/**
 * Invitation expiry. Rendered in UTC and labelled, because an invitation isn't
 * tied to a place the way an event is — and an unlabelled date would otherwise
 * silently mean whatever zone the server runs in.
 */
function formatDate(value: Date): string {
  return `${formatInZone(value, "UTC", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })} UTC`;
}

/**
 * Loads pending invitations and marks which have lapsed. Kept out of the
 * component so the clock is read while fetching rather than during render.
 */
async function loadPendingInvitations(tenantId: string) {
  const rows = await prisma.invitation.findMany({
    where: { tenantId, acceptedAt: null },
    orderBy: { createdAt: "desc" },
  });
  const now = Date.now();
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    expiresAt: row.expiresAt,
    expired: row.expiresAt.getTime() <= now,
  }));
}

export default async function TeamPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // Managing the team is an admin job; staff get the same not-found as a
  // non-member, so the page's existence isn't a hint either way.
  const ctx = await requireMembership(slug, "ADMIN");

  const [members, invitations] = await Promise.all([
    prisma.membership.findMany({
      where: { tenantId: ctx.tenant.id },
      include: { user: { select: { name: true, email: true } } },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
    loadPendingInvitations(ctx.tenant.id),
  ]);

  const adminTotal = members.filter((m) => m.role === "ADMIN").length;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
      <p className="mt-1 text-sm text-muted">
        Invite colleagues to help run {ctx.tenant.name}.
      </p>

      <InviteForm tenantSlug={ctx.tenant.slug} />

      <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
        {(["ADMIN", "STAFF"] as const).map((role) => (
          <div key={role} className="flex gap-1.5">
            <dt className="font-medium text-fg">{ROLE_LABEL[role]}:</dt>
            <dd>{ROLE_SUMMARY[role]}</dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-10 text-sm font-semibold">
        Members{" "}
        <span className="font-normal text-muted">({members.length})</span>
      </h2>
      <ul className="mt-3 overflow-hidden rounded-xl border border-line bg-surface">
        {members.map((m) => {
          const isSelf = m.userId === ctx.userId;
          const isLastAdmin = m.role === "ADMIN" && adminTotal <= 1;
          return (
            <li
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {m.user.name ?? m.user.email}
                  {isSelf ? <span className="text-muted"> (you)</span> : null}
                </p>
                {m.user.name ? (
                  <p className="text-xs text-muted">{m.user.email}</p>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                {isLastAdmin ? (
                  <span
                    className="rounded-full bg-panel px-2.5 py-1 font-mono text-[11px] text-muted"
                    title="The only admin — promote someone else first"
                  >
                    {ROLE_LABEL[m.role]}
                  </span>
                ) : (
                  <form action={changeRole}>
                    <input type="hidden" name="tenantSlug" value={ctx.tenant.slug} />
                    <input type="hidden" name="membershipId" value={m.id} />
                    <input
                      type="hidden"
                      name="role"
                      value={m.role === "ADMIN" ? "STAFF" : "ADMIN"}
                    />
                    <button
                      type="submit"
                      className="rounded-lg border border-line-strong px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-panel"
                    >
                      {m.role === "ADMIN" ? "Make staff" : "Make admin"}
                    </button>
                  </form>
                )}

                {isLastAdmin ? null : (
                  <form action={removeMember}>
                    <input type="hidden" name="tenantSlug" value={ctx.tenant.slug} />
                    <input type="hidden" name="membershipId" value={m.id} />
                    <button
                      type="submit"
                      className="rounded-lg border border-line-strong px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-panel hover:text-fg"
                    >
                      {isSelf ? "Leave" : "Remove"}
                    </button>
                  </form>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {adminTotal <= 1 ? (
        <p className="mt-2 text-xs text-muted">
          Your organization needs at least one admin, so the last one can&apos;t be
          removed or changed to staff.
        </p>
      ) : null}

      <h2 className="mt-10 text-sm font-semibold">
        Pending invitations{" "}
        <span className="font-normal text-muted">({invitations.length})</span>
      </h2>
      {invitations.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-line-strong bg-surface p-6 text-center">
          <p className="text-sm text-muted">No invitations waiting.</p>
        </div>
      ) : (
        <ul className="mt-3 overflow-hidden rounded-xl border border-line bg-surface">
          {invitations.map((invite) => {
            const expired = invite.expired;
            return (
              <li
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{invite.email}</p>
                  <p className="text-xs text-muted">
                    {ROLE_LABEL[invite.role]} ·{" "}
                    {expired
                      ? "expired"
                      : `expires ${formatDate(invite.expiresAt)}`}
                  </p>
                </div>
                <form action={revokeInvitation}>
                  <input type="hidden" name="tenantSlug" value={ctx.tenant.slug} />
                  <input type="hidden" name="invitationId" value={invite.id} />
                  <button
                    type="submit"
                    className="rounded-lg border border-line-strong px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-panel hover:text-fg"
                  >
                    Revoke
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
