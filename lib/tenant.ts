import { prisma } from "@/lib/db";
import { VERIFICATION_TTL_HOURS } from "@/lib/tokens";

/**
 * Names that must never resolve to a tenant.
 *
 * The first group is load-bearing: these are the top-level route folders, so a
 * tenant with one of these slugs would have its subdomain rewritten into a
 * first-party surface. Claiming `home`, for instance, would serve the marketing
 * site and signup form from what looks like a customer's address, while that
 * tenant's own pages became unreachable. Keep in step with the folders in app/.
 */
const ROUTE_GROUP_NAMES = ["home", "app", "api"] as const;

/** The rest are reserved by convention: impersonation risk or future use. */
const CONVENTIONALLY_RESERVED = [
  "www",
  "admin",
  "mail",
  "smtp",
  "imap",
  "support",
  "login",
  "signup",
  "auth",
  "static",
  "assets",
  "cdn",
  "help",
  "status",
  "billing",
  "dashboard",
  "account",
  "security",
  "internal",
] as const;

const RESERVED_SUBDOMAINS = new Set<string>([
  ...ROUTE_GROUP_NAMES,
  ...CONVENTIONALLY_RESERVED,
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
