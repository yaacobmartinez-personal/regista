import { prisma } from "@/lib/db";
import { requireApiUser } from "@/lib/api-auth";
import { conflict, route } from "@/lib/api-response";

/**
 * E7 — close your own account. The product's first account-removal path.
 *
 * The row is anonymized rather than deleted, the same trade `eraseRegistration`
 * makes: an audit entry that lost its actor could no longer answer "who checked
 * this person in", and AuditLog deliberately restricts tenant deletes for the
 * same reason. What goes is everything that identifies the person, plus every
 * membership — so the account can no longer sign in, be invited back by address,
 * or appear on a team.
 *
 * Raising `tokenVersion` is what ends the sessions. Nothing else would: the row
 * survives, so every bearer token minted for it would otherwise keep resolving
 * until its thirty days ran out.
 *
 * Refused while the caller is the only admin of an organization that other
 * people or real events depend on. Leaving one adrift with no one able to
 * administer it is worse than making them hand it over first.
 */
export const DELETE = route(async (request: Request) => {
  const user = await requireApiUser(request);

  const blocked = await prisma.$transaction(async (tx) => {
    const adminMemberships = await tx.membership.findMany({
      where: { userId: user.id, role: "ADMIN" },
      select: { tenant: { select: { id: true, slug: true, name: true } } },
    });

    const stuck: { tenantSlug: string; tenantName: string }[] = [];

    for (const { tenant } of adminMemberships) {
      // Serialise against other admin changes in this tenant — the same lock
      // withLastAdminGuard takes in the web's team actions. Counting outside a
      // lock lets two admins leave at once, each seeing the other.
      await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${tenant.id} FOR UPDATE`;

      const [admins, otherMembers, events] = await Promise.all([
        tx.membership.count({ where: { tenantId: tenant.id, role: "ADMIN" } }),
        tx.membership.count({ where: { tenantId: tenant.id, userId: { not: user.id } } }),
        tx.event.count({ where: { tenantId: tenant.id } }),
      ]);

      // An organization nobody else is in and nothing has happened under is not
      // stranded by its owner leaving, so it does not hold the account open.
      if (admins === 1 && (otherMembers > 0 || events > 0)) {
        stuck.push({ tenantSlug: tenant.slug, tenantName: tenant.name });
      }
    }

    if (stuck.length > 0) return stuck;

    await tx.membership.deleteMany({ where: { userId: user.id } });
    // The places they booked stay booked — an organizer's headcount does not
    // change because someone stopped using the app — but they stop belonging to
    // an account. The emailed link remains the way back to them.
    await tx.registration.updateMany({
      where: { userId: user.id },
      data: { userId: null },
    });
    await tx.user.update({
      where: { id: user.id },
      data: {
        // Placeholder rather than null: the address is unique, and a real one
        // left behind would keep the account findable and re-invitable.
        email: `deleted+${user.id}@anon.invalid`,
        name: null,
        passwordHash: null,
        emailVerified: null,
        tokenVersion: { increment: 1 },
      },
    });

    return [];
  });

  if (blocked.length > 0) {
    const names = blocked.map((b) => b.tenantName).join(", ");
    throw conflict(
      `You're the only admin of ${names}. Make someone else an admin or delete the organization first.`,
      { reason: "sole_admin", blocked },
    );
  }

  return Response.json({ ok: true });
});
