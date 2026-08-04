/**
 * One-off backfill: mint a check-in token for registrations created before the
 * QR ticket existed, so every live (non-erased) registration has one.
 *
 * Safe to run more than once — it only touches rows where the token is still
 * NULL, and skips anonymized (erased) rows, which must never regain a token.
 *
 *   node prisma/backfill-checkin.mjs
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

const prisma = new PrismaClient();

const rows = await prisma.registration.findMany({
  where: { checkInToken: null, anonymizedAt: null },
  select: { id: true },
});

let done = 0;
for (const { id } of rows) {
  // Unique index makes a collision a no-op to retry; 128-bit makes it a
  // non-event in practice.
  await prisma.registration.update({
    where: { id },
    data: { checkInToken: randomBytes(16).toString("base64url") },
  });
  done++;
}

console.log(`Backfilled ${done} registration(s) with a check-in token.`);
await prisma.$disconnect();
