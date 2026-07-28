import { prisma } from "@/lib/db";
import { VERIFICATION_TTL_HOURS } from "@/lib/tokens";

const RESERVED_SUBDOMAINS = new Set([
  "www",
  "app",
  "api",
  "admin",
  "mail",
  "support",
  "login",
  "static",
  "assets",
  "cdn",
  "help",
  "status",
  "billing",
  "dashboard",
]);

/** True if a slug is syntactically valid AND not reserved. */
export function isUsableSlug(slug: string): boolean {
  if (RESERVED_SUBDOMAINS.has(slug)) return false;
  // 3–63 chars, lowercase alphanumeric + internal hyphens.
  return /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/.test(slug);
}

export function isReservedSubdomain(slug: string): boolean {
  return RESERVED_SUBDOMAINS.has(slug);
}

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
    select: { id: true, status: true, createdAt: true },
  });
  if (!tenant) return { state: "free" };

  const windowClosed =
    tenant.createdAt.getTime() + VERIFICATION_TTL_HOURS * 60 * 60 * 1000 <= Date.now();

  if (tenant.status === "PENDING" && windowClosed) {
    return { state: "abandoned", tenantId: tenant.id };
  }
  return { state: "taken" };
}

/** Release an abandoned signup so its address can be reused. */
export async function releaseAbandonedTenant(tenantId: string): Promise<void> {
  // Verification tokens carry tenantId without a foreign key, so they are
  // removed explicitly; memberships cascade with the tenant.
  await prisma.verificationToken.deleteMany({ where: { tenantId } });
  await prisma.tenant.delete({ where: { id: tenantId } });
}

/** Look up an ACTIVE tenant by slug. Returns null if missing or not active. */
export async function resolveActiveTenant(slug: string) {
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant || tenant.status !== "ACTIVE") return null;
  return tenant;
}
