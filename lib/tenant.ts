import { Prisma, type PlanTier } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
// Re-exported below for callers; also used directly by createTenantForUser.
import { isReservedSubdomain, isUsableSlug } from "@/lib/slug";
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

/**
 * Create an organization for an account that already exists (#35).
 *
 * Unlike web signup, which creates the organization and its owner together and
 * leaves it PENDING until a link is clicked, the caller here has already
 * confirmed their address — that is what being signed in means. There is
 * nothing left to verify, so the organization is ACTIVE at once and no email
 * goes out.
 *
 * The address rules are the web's: a reserved name is refused, a malformed one
 * is refused, a taken one is refused, and a signup that never confirmed and
 * never did anything is released so its address can be reused.
 */
export type CreateTenantResult =
  | { outcome: "created"; tenant: { slug: string; name: string; plan: PlanTier } }
  | { outcome: "invalid_slug" }
  | { outcome: "reserved_slug" }
  | { outcome: "taken" };

export async function createTenantForUser(
  userId: string,
  input: { name: string; slug: string },
): Promise<CreateTenantResult> {
  const slug = input.slug.trim().toLowerCase();
  const name = input.name.trim();

  if (isReservedSubdomain(slug)) return { outcome: "reserved_slug" };
  if (!isUsableSlug(slug)) return { outcome: "invalid_slug" };

  const availability = await slugAvailability(slug);
  if (availability.state === "taken") return { outcome: "taken" };
  if (availability.state === "abandoned") {
    // Someone else may have claimed it in the meantime, or it may have gained
    // data since the check — either way the release declines and the address
    // stays taken rather than erroring.
    const released = await releaseAbandonedTenant(availability.tenantId);
    if (!released) return { outcome: "taken" };
  }

  try {
    const tenant = await prisma.$transaction(async (tx) => {
      const created = await tx.tenant.create({
        data: { slug, name, status: "ACTIVE" },
        select: { id: true, slug: true, name: true, plan: true },
      });
      await tx.membership.create({
        data: { userId, tenantId: created.id, role: "ADMIN" },
      });
      return created;
    });

    await recordAudit({
      tenantId: tenant.id,
      actorUserId: userId,
      action: "CREATE_TENANT",
      targetType: "Tenant",
      targetId: tenant.id,
    });

    return {
      outcome: "created",
      tenant: { slug: tenant.slug, name: tenant.name, plan: tenant.plan },
    };
  } catch (error) {
    // Unique (slug): two people claimed the same address at once, and the other
    // one got there first. A refusal, not a crash.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { outcome: "taken" };
    }
    throw error;
  }
}
