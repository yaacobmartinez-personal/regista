import { redirect, notFound } from "next/navigation";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const ROLE_RANK: Record<Role, number> = { STAFF: 1, ADMIN: 2 };

export function roleAtLeast(role: Role, min: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

export type TenantContext = {
  userId: string;
  tenant: { id: string; slug: string; name: string };
  role: Role;
};

/**
 * Gate a dashboard action to a member of `tenantSlug`.
 *
 * - Requires an authenticated session (else -> /login).
 * - Resolves membership + role FROM THE DB on every call, so revoking a member
 *   or changing a role takes effect immediately (the JWT carries identity only).
 * - A user with no membership in the tenant is treated as not-found (no
 *   existence disclosure), which also blocks cross-tenant access.
 */
export async function requireMembership(
  tenantSlug: string,
  minRole?: Role,
): Promise<TenantContext> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, tenant: { slug: tenantSlug } },
    include: { tenant: true },
  });

  if (!membership) notFound();
  if (minRole && !roleAtLeast(membership.role, minRole)) notFound();

  return {
    userId: session.user.id,
    tenant: {
      id: membership.tenant.id,
      slug: membership.tenant.slug,
      name: membership.tenant.name,
    },
    role: membership.role,
  };
}

/** All tenants the current user belongs to (for the org switcher). */
export async function myMemberships() {
  const session = await auth();
  if (!session?.user?.id) return [];
  return prisma.membership.findMany({
    where: { userId: session.user.id },
    include: { tenant: true },
    orderBy: { createdAt: "asc" },
  });
}
