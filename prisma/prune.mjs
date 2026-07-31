/**
 * Retention housekeeping, runnable on a schedule (`pnpm db:prune`).
 *
 * Mirrors lib/retention.ts. Kept as plain Node ESM because tsx does not work in
 * this environment — see docs/DEVELOPMENT.md.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TOKEN_GRACE_DAYS = 7;

async function main() {
  const cutoff = new Date(Date.now() - TOKEN_GRACE_DAYS * 24 * 60 * 60 * 1000);

  const tokens = await prisma.verificationToken.deleteMany({
    where: { OR: [{ usedAt: { lt: cutoff } }, { expiresAt: { lt: cutoff } }] },
  });
  const invitations = await prisma.invitation.deleteMany({
    where: { OR: [{ acceptedAt: { lt: cutoff } }, { expiresAt: { lt: cutoff } }] },
  });

  console.log(
    `Pruned ${tokens.count} verification token(s) and ${invitations.count} invitation(s) older than ${TOKEN_GRACE_DAYS} days.`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
