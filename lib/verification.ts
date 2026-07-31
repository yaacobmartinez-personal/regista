import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/tokens";

/**
 * Signup email verification.
 *
 * Looking up and redeeming are separate on purpose. Rendering the link must not
 * change anything: mail clients and security scanners follow links in messages,
 * and a page that activated the account on GET would be spent before the person
 * ever clicked. Redemption happens on an explicit action.
 */

export type PendingVerification = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  email: string;
};

export type VerificationState =
  | { kind: "pending"; verification: PendingVerification }
  | { kind: "active"; tenantName: string; tenantSlug: string }
  | { kind: "invalid" };

/** Read-only: what this token currently means. Never writes. */
export async function inspectVerification(
  rawToken: string | undefined,
): Promise<VerificationState> {
  if (!rawToken) return { kind: "invalid" };

  const record = await prisma.verificationToken.findUnique({
    where: { token: hashToken(rawToken) },
  });
  if (!record?.tenantId) return { kind: "invalid" };

  const tenant = await prisma.tenant.findUnique({
    where: { id: record.tenantId },
    select: { id: true, name: true, slug: true, status: true },
  });
  if (!tenant) return { kind: "invalid" };

  // Spent already: if the organization is live, say so plainly. Someone
  // re-opening the link from their inbox should see what happened, not an error.
  if (record.usedAt) {
    return tenant.status === "ACTIVE"
      ? { kind: "active", tenantName: tenant.name, tenantSlug: tenant.slug }
      : { kind: "invalid" };
  }

  if (record.expiresAt.getTime() <= Date.now()) return { kind: "invalid" };

  return {
    kind: "pending",
    verification: {
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      email: record.identifier,
    },
  };
}

/**
 * Redeem the token: activate the organization and mark the address confirmed.
 *
 * The token is claimed with a conditional update inside the transaction, so two
 * simultaneous redemptions produce one activation rather than racing.
 */
export async function redeemVerification(
  rawToken: string,
): Promise<{ tenantName: string; tenantSlug: string } | null> {
  const tokenHash = hashToken(rawToken);

  return prisma.$transaction(async (tx) => {
    const record = await tx.verificationToken.findUnique({
      where: { token: tokenHash },
    });
    if (!record?.tenantId) return null;
    if (record.expiresAt.getTime() <= Date.now()) return null;

    const claimed = await tx.verificationToken.updateMany({
      where: { token: tokenHash, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) return null; // someone else got here first

    const tenant = await tx.tenant.update({
      where: { id: record.tenantId },
      data: { status: "ACTIVE" },
      select: { name: true, slug: true },
    });

    await tx.user.updateMany({
      where: { email: record.identifier, emailVerified: null },
      data: { emailVerified: new Date() },
    });

    return { tenantName: tenant.name, tenantSlug: tenant.slug };
  });
}
