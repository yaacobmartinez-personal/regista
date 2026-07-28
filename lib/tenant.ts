import { prisma } from "@/lib/db";

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

/** Look up an ACTIVE tenant by slug. Returns null if missing or not active. */
export async function resolveActiveTenant(slug: string) {
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant || tenant.status !== "ACTIVE") return null;
  return tenant;
}
