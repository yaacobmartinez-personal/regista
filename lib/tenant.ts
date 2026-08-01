import { prisma } from "@/lib/db";
import { VERIFICATION_TTL_HOURS } from "@/lib/tokens";

// Slug rules live in lib/slug.ts, which has no imports so the browser can run
// exactly the same code when previewing an address as the server does when
// deciding whether it is allowed.
export { isReservedSubdomain, isUsableSlug, slugify } from "@/lib/slug";

/**
 * Extract the tenant subdomain from a host header, relative to the configured
 * root domain. Returns null for the apex/www (no tenant subdomain).
 */
export function subdomainFromHost(host: string | null): string | null {
  if (!host) return null;
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
  const hostname = host.toLowerCase();

  if (hostname === rootDomain || hostname === `www.${rootDomain}`) return null;
  if (hostname.endsWith(`.${rootDomain}`)) {
    return hostname.slice(0, hostname.length - rootDomain.length - 1);
  }
  return null;
}

/**
 * Whether an address can be claimed.
 *
 * A signup that is never verified would otherwise hold its address forever,
 * which is both a slow leak and a way to squat names deliberately. Once the
 * verification window has passed with the tenant still unverified, the address
 * is treated as abandoned and can be taken by someone else.
 */
export async function slugAvailability(
  slug: string,
): Promise<{ state: "free" } | { state: "taken" } | { state: "abandoned"; tenantId: string }> {
  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: {
      id: true,
      status: true,
      createdAt: true,
      _count: { select: { events: true, registrations: true, auditLogs: true } },
    },
  });
  if (!tenant) return { state: "free" };

  const windowClosed =
    tenant.createdAt.getTime() + VERIFICATION_TTL_HOURS * 60 * 60 * 1000 <= Date.now();

  // Releasing an address destroys everything under it, so only a signup that
  // never confirmed AND never did anything is treated as abandoned. Anything
  // holding real data stays taken, whatever its status says.
  const holdsData =
    tenant._count.events > 0 ||
    tenant._count.registrations > 0 ||
    tenant._count.auditLogs > 0;

  if (tenant.status === "PENDING" && windowClosed && !holdsData) {
    return { state: "abandoned", tenantId: tenant.id };
  }
  return { state: "taken" };
}

/**
 * Release an abandoned signup so its address can be reused.
 *
 * Re-checks the abandoned conditions inside the delete so a tenant that gained
 * data (or was verified) between the check and here is left alone, and so a
 * concurrent claim of the same address is a no-op rather than an error.
 */
export async function releaseAbandonedTenant(tenantId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.findFirst({
      where: {
        id: tenantId,
        status: "PENDING",
        events: { none: {} },
        registrations: { none: {} },
        auditLogs: { none: {} },
      },
      select: { id: true },
    });
    if (!tenant) return false;

    // Verification tokens carry tenantId without a foreign key, so they are
    // removed explicitly; memberships cascade with the tenant.
    await tx.verificationToken.deleteMany({ where: { tenantId } });
    const deleted = await tx.tenant.deleteMany({ where: { id: tenantId } });
    return deleted.count > 0;
  });
}

/** Look up an ACTIVE tenant by slug. Returns null if missing or not active. */
export async function resolveActiveTenant(slug: string) {
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant || tenant.status !== "ACTIVE") return null;
  return tenant;
}
