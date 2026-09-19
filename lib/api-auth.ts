import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { roleAtLeast } from "@/lib/authz";
import { bearerToken, verifyToken } from "@/lib/mobile-auth";
import { forbidden, unauthorized } from "@/lib/api-response";

/**
 * Authorization for the mobile API.
 *
 * The web equivalents in lib/authz.ts answer with navigation — `redirect()` to
 * the login page, `notFound()` for a non-member. A native client needs a status
 * code and a JSON body instead, so these are the API-shaped siblings. The rules
 * they enforce are the same, with one deliberate difference recorded on
 * `forbidden()`: a missing tenant is 403 here, not 404.
 *
 * As on the web, the token carries identity only. Membership and role are read
 * from the database on every request, so revoking a member or changing a role
 * takes effect on their next call rather than when their token expires.
 */

export type ApiUser = {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
};

export type ApiTenantContext = {
  userId: string;
  tenant: { id: string; slug: string; name: string };
  role: Role;
};

/**
 * Resolve the bearer token to a user, or reject with 401.
 *
 * The `ver` check is what makes tokens revocable: a token carries the
 * `tokenVersion` it was minted with, and raising that column invalidates every
 * token in circulation for the account without touching its password or its web
 * session. Costs nothing extra — the user row has to be read here regardless.
 */
export async function requireApiUser(request: Request): Promise<ApiUser> {
  const payload = verifyToken(bearerToken(request));
  if (!payload) throw unauthorized();

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      email: true,
      name: true,
      emailVerified: true,
      tokenVersion: true,
    },
  });

  // A deleted account fails here, so DELETE /mobile/account also ends every
  // session it had open.
  if (!user) throw unauthorized();
  if (user.tokenVersion !== payload.ver) throw unauthorized();

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    emailVerified: user.emailVerified !== null,
  };
}

/**
 * Gate a request to a member of `tenantSlug`, optionally at a minimum role.
 *
 * Every "no" is the same 403: not a member, too junior, the organization has not
 * confirmed its address, or there is no such organization. See `forbidden()` for
 * why they are not distinguished.
 */
export async function requireApiMembership(
  request: Request,
  tenantSlug: string,
  minRole?: Role,
): Promise<ApiTenantContext> {
  const user = await requireApiUser(request);

  const membership = await prisma.membership.findFirst({
    where: { userId: user.id, tenant: { slug: tenantSlug } },
    include: { tenant: true },
  });

  if (!membership) throw forbidden();
  if (membership.tenant.status !== "ACTIVE") throw forbidden();
  if (minRole && !roleAtLeast(membership.role, minRole)) throw forbidden();

  return {
    userId: user.id,
    tenant: {
      id: membership.tenant.id,
      slug: membership.tenant.slug,
      name: membership.tenant.name,
    },
    role: membership.role,
  };
}
