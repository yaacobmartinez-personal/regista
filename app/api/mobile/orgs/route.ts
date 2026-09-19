import { prisma } from "@/lib/db";
import { requireApiUser } from "@/lib/api-auth";
import { route } from "@/lib/api-response";

/**
 * E2 — the organizations the signed-in person belongs to.
 *
 * PENDING tenants are left out: an organization that has not confirmed its
 * address cannot be used yet, and the app has nowhere to send someone who picks
 * one. The web makes the same choice in its organization chooser, which is why
 * it explains the omission there rather than listing them.
 */
export const GET = route(async (request: Request) => {
  const user = await requireApiUser(request);

  const memberships = await prisma.membership.findMany({
    where: { userId: user.id, tenant: { status: "ACTIVE" } },
    include: { tenant: { select: { slug: true, name: true, plan: true } } },
    orderBy: { createdAt: "asc" },
  });

  return Response.json({
    orgs: memberships.map((membership) => ({
      slug: membership.tenant.slug,
      name: membership.tenant.name,
      role: membership.role,
      plan: membership.tenant.plan,
    })),
  });
});
