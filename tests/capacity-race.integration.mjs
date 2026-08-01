/**
 * Capacity race — integration test. Needs a running database (`pnpm db:up`).
 *
 * Overselling a room is the worst thing this product can do, and the row lock
 * that prevents it is exactly the kind of line a refactor deletes as redundant.
 * This was run by hand during M3 and never committed; that gap is why it is
 * here.
 *
 * Runs twice: once the way the app does it, and once with the lock removed as a
 * control. Without the control the test could pass vacuously — a "with lock"
 * run alone proves nothing if the scenario never actually races.
 *
 * Plain Node ESM rather than the unit-test runner because it needs Prisma, and
 * the pure-module compile step deliberately excludes anything with imports.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CAPACITY = 5;
const ATTEMPTS = 20;
const TENANT_SLUG = "acme";

async function setupEvent(slug) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (!tenant) throw new Error(`Seed tenant "${TENANT_SLUG}" missing — run pnpm db:seed`);

  await prisma.event.deleteMany({ where: { tenantId: tenant.id, slug } });
  const event = await prisma.event.create({
    data: {
      tenantId: tenant.id,
      slug,
      title: `Capacity race (${slug})`,
      startsAt: new Date(Date.now() + 86_400_000),
      timezone: "UTC",
      capacity: CAPACITY,
      // Waitlist off, so an oversell shows up as confirmed > capacity rather
      // than being absorbed silently.
      waitlistEnabled: false,
      status: "PUBLISHED",
    },
  });
  return { tenant, event };
}

/** Mirrors the transaction in app/[domain]/[eventSlug]/actions.tsx. */
async function attemptRegistration({ tenantId, eventId, email, useLock }) {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const event = await tx.event.findFirst({
          where: { id: eventId, status: "PUBLISHED" },
        });
        if (!event) return "closed";

        let capacity = event.capacity;
        let waitlistEnabled = event.waitlistEnabled;

        if (useLock) {
          const locked = await tx.$queryRaw`
            SELECT capacity, "waitlistEnabled" FROM "Event" WHERE id = ${eventId} FOR UPDATE
          `;
          capacity = locked[0]?.capacity ?? null;
          waitlistEnabled = locked[0]?.waitlistEnabled ?? false;
        }

        const confirmed = await tx.registration.count({
          where: { eventId, status: "CONFIRMED" },
        });

        const isFull = capacity !== null && confirmed >= capacity;
        if (isFull && !waitlistEnabled) return "full";

        // Widen the window between the count and the write so a missing lock
        // loses reliably rather than intermittently.
        await new Promise((resolve) => setTimeout(resolve, 15));

        await tx.registration.create({
          data: {
            tenantId,
            eventId,
            email,
            name: email,
            status: isFull ? "WAITLIST" : "CONFIRMED",
          },
        });
        return isFull ? "waitlisted" : "confirmed";
      },
      { maxWait: 10_000, timeout: 15_000 },
    );
  } catch (error) {
    if (error.code === "P2002") return "duplicate";
    if (error.code === "P2028" || error.code === "P2034") return "contention";
    throw error;
  }
}

async function run(useLock) {
  const slug = useLock ? "race-locked" : "race-unlocked";
  const { tenant, event } = await setupEvent(slug);

  const results = await Promise.all(
    Array.from({ length: ATTEMPTS }, (_, i) =>
      attemptRegistration({
        tenantId: tenant.id,
        eventId: event.id,
        email: `racer${i}@capacity.test`,
        useLock,
      }),
    ),
  );

  const confirmed = await prisma.registration.count({
    where: { eventId: event.id, status: "CONFIRMED" },
  });

  const tally = results.reduce(
    (acc, r) => ({ ...acc, [r]: (acc[r] ?? 0) + 1 }),
    {},
  );

  await prisma.event.delete({ where: { id: event.id } });

  console.log(
    `${useLock ? "with lock   " : "without lock"} -> confirmed ${confirmed}/${CAPACITY}  ${JSON.stringify(tally)}`,
  );
  return { confirmed, oversold: confirmed > CAPACITY };
}

const withLock = await run(true);
const withoutLock = await run(false);
await prisma.$disconnect();

console.log("");
if (withLock.oversold) {
  console.error(
    `FAIL: the shipped path oversold — ${withLock.confirmed} confirmed against a capacity of ${CAPACITY}.`,
  );
  process.exit(1);
}
if (!withoutLock.oversold) {
  console.error(
    "INCONCLUSIVE: the unlocked control did not oversell either, so this run does not " +
      "demonstrate the lock is doing the work. Raise ATTEMPTS or the delay and re-run.",
  );
  process.exit(1);
}
console.log(
  `PASS: held at ${withLock.confirmed}/${CAPACITY} with the lock; the unlocked control ` +
    `oversold to ${withoutLock.confirmed}, so the scenario genuinely races.`,
);
