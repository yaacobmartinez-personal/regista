/**
 * Registration lifecycle — integration test. Needs a running database
 * (`pnpm db:up`).
 *
 * Covers the three state changes registrant self-service introduced, all of
 * which are invisible in the type system and only observable as database state:
 *
 *   1. Cancelling frees a confirmed place — and moves nobody up. Promotion on
 *      cancellation is deliberately the organizer's decision, so a future change
 *      that "helpfully" auto-promotes should fail here rather than quietly alter
 *      who gets in.
 *   2. Promoting respects capacity, and is refused when the event is full.
 *   3. Signing up again after cancelling reactivates the existing row instead of
 *      colliding with the (eventId, email) unique index — and rejoins the
 *      waitlist at the back, not at its original position.
 *
 * Like the capacity-race test, this mirrors the shipped transactions rather than
 * importing them: the app modules are TypeScript behind `@/` path aliases and
 * pull in Next-only APIs, which plain Node cannot resolve. Mirrored code can
 * drift from the original, so the copies below are kept deliberately short and
 * annotated with the file they track.
 */
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";

const prisma = new PrismaClient();

const TENANT_SLUG = "acme";
const failures = [];

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(
    `${ok ? "  ok  " : "  FAIL"} ${label}` +
      (ok ? "" : `\n         expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`),
  );
  if (!ok) failures.push(label);
}

function hashToken(raw) {
  return createHash("sha256").update(raw).digest("hex");
}

async function freshEvent({ slug, capacity, waitlistEnabled }) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (!tenant) throw new Error(`Seed tenant "${TENANT_SLUG}" missing — run pnpm db:seed`);

  await prisma.event.deleteMany({ where: { tenantId: tenant.id, slug } });
  const event = await prisma.event.create({
    data: {
      tenantId: tenant.id,
      slug,
      title: `Lifecycle (${slug})`,
      startsAt: new Date(Date.now() + 86_400_000),
      timezone: "UTC",
      capacity,
      waitlistEnabled,
      status: "PUBLISHED",
    },
  });
  return { tenant, event };
}

/** Mirrors the transaction in app/[domain]/[eventSlug]/actions.tsx. */
async function register({ tenantId, eventId, email, name }) {
  const manage = randomBytes(32).toString("base64url");
  const outcome = await prisma.$transaction(
    async (tx) => {
      const locked = await tx.$queryRaw`
        SELECT capacity, "waitlistEnabled" FROM "Event" WHERE id = ${eventId} FOR UPDATE
      `;
      const { capacity, waitlistEnabled } = locked[0];

      const confirmed = await tx.registration.count({
        where: { eventId, status: "CONFIRMED" },
      });

      const existing = await tx.registration.findUnique({
        where: { eventId_email: { eventId, email } },
        select: { id: true, status: true },
      });
      if (existing && existing.status !== "CANCELLED") return "duplicate";

      const isFull = capacity !== null && confirmed >= capacity;
      if (isFull && !waitlistEnabled) return "full";
      const status = isFull ? "WAITLIST" : "CONFIRMED";

      if (existing) {
        await tx.registration.update({
          where: { id: existing.id },
          data: { name, status, manageToken: hashToken(manage), createdAt: new Date() },
        });
      } else {
        await tx.registration.create({
          data: {
            tenantId,
            eventId,
            email,
            name,
            status,
            manageToken: hashToken(manage),
          },
        });
      }
      return isFull ? "waitlisted" : "confirmed";
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
  return { outcome, manageToken: manage };
}

/** Mirrors cancelRegistration in lib/registrations.ts. */
async function cancel(rawToken) {
  const registration = await prisma.registration.findUnique({
    where: { manageToken: hashToken(rawToken) },
    select: { id: true, status: true, anonymizedAt: true, event: { select: { startsAt: true } } },
  });
  if (!registration || registration.anonymizedAt) return "invalid";
  if (registration.status === "CANCELLED") return "already";
  if (registration.event.startsAt.getTime() <= Date.now()) return "started";

  const changed = await prisma.registration.updateMany({
    where: { id: registration.id, status: { not: "CANCELLED" } },
    data: { status: "CANCELLED" },
  });
  return changed.count === 1 ? "cancelled" : "already";
}

/** Mirrors promoteRegistration in the attendees actions. */
async function promote(registrationId) {
  return prisma.$transaction(async (tx) => {
    const registration = await tx.registration.findFirst({
      where: { id: registrationId, status: "WAITLIST" },
      select: { id: true, eventId: true },
    });
    if (!registration) return "gone";

    const locked = await tx.$queryRaw`
      SELECT capacity FROM "Event" WHERE id = ${registration.eventId} FOR UPDATE
    `;
    const capacity = locked[0]?.capacity ?? null;

    const confirmed = await tx.registration.count({
      where: { eventId: registration.eventId, status: "CONFIRMED" },
    });
    if (capacity !== null && confirmed >= capacity) return "full";

    const changed = await tx.registration.updateMany({
      where: { id: registration.id, status: "WAITLIST" },
      data: { status: "CONFIRMED" },
    });
    return changed.count === 1 ? "promoted" : "gone";
  });
}

const statuses = (eventId) =>
  prisma.registration
    .findMany({ where: { eventId }, orderBy: { createdAt: "asc" }, select: { email: true, status: true } })
    .then((rows) => rows.map((r) => `${r.email.split("@")[0]}:${r.status}`));

// ── 1. Cancelling frees a place and promotes nobody ─────────────────────────
{
  console.log("\ncancelling frees a place without moving the queue");
  const { tenant, event } = await freshEvent({
    slug: "lifecycle-cancel",
    capacity: 2,
    waitlistEnabled: true,
  });
  const ids = { tenantId: tenant.id, eventId: event.id };

  const a = await register({ ...ids, email: "ann@lifecycle.test", name: "Ann" });
  const b = await register({ ...ids, email: "bo@lifecycle.test", name: "Bo" });
  const c = await register({ ...ids, email: "cy@lifecycle.test", name: "Cy" });

  check("first two are confirmed, third waitlisted", [a.outcome, b.outcome, c.outcome], [
    "confirmed",
    "confirmed",
    "waitlisted",
  ]);

  check("cancelling a confirmed place succeeds", await cancel(a.manageToken), "cancelled");
  check("cancelling twice is idempotent", await cancel(a.manageToken), "already");

  check("the waitlisted person was NOT moved up", await statuses(event.id), [
    "ann:CANCELLED",
    "bo:CONFIRMED",
    "cy:WAITLIST",
  ]);

  const confirmed = await prisma.registration.count({
    where: { eventId: event.id, status: "CONFIRMED" },
  });
  check("the freed place shows as available", confirmed, 1);

  // ── 2. The organizer can promote into the freed place ─────────────────────
  console.log("\nthe organizer can then promote into that place");
  const cy = await prisma.registration.findFirst({
    where: { eventId: event.id, email: "cy@lifecycle.test" },
    select: { id: true },
  });
  check("promoting into the free place succeeds", await promote(cy.id), "promoted");
  check("promoting again finds nobody waitlisted", await promote(cy.id), "gone");

  const dee = await register({ ...ids, email: "dee@lifecycle.test", name: "Dee" });
  check("a later arrival is waitlisted", dee.outcome, "waitlisted");
  const deeRow = await prisma.registration.findFirst({
    where: { eventId: event.id, email: "dee@lifecycle.test" },
    select: { id: true },
  });
  check("promoting past capacity is refused", await promote(deeRow.id), "full");

  await prisma.event.delete({ where: { id: event.id } });
}

// ── 3. Signing up again after cancelling ────────────────────────────────────
{
  console.log("\nsigning up again after cancelling");
  const { tenant, event } = await freshEvent({
    slug: "lifecycle-rejoin",
    capacity: 1,
    waitlistEnabled: true,
  });
  const ids = { tenantId: tenant.id, eventId: event.id };

  const eve = await register({ ...ids, email: "eve@lifecycle.test", name: "Eve" });
  check("Eve takes the only place", eve.outcome, "confirmed");

  const dup = await register({ ...ids, email: "eve@lifecycle.test", name: "Eve" });
  check("signing up twice while registered is refused", dup.outcome, "duplicate");

  check("Eve cancels", await cancel(eve.manageToken), "cancelled");

  const flo = await register({ ...ids, email: "flo@lifecycle.test", name: "Flo" });
  check("Flo takes the freed place", flo.outcome, "confirmed");

  const again = await register({ ...ids, email: "eve@lifecycle.test", name: "Eve" });
  check("Eve can sign up again rather than hitting the unique index", again.outcome, "waitlisted");
  check("her old link no longer opens the registration", await cancel(eve.manageToken), "invalid");
  check("the new link does", await cancel(again.manageToken), "cancelled");

  await prisma.event.delete({ where: { id: event.id } });
}

await prisma.$disconnect();

console.log("");
if (failures.length > 0) {
  console.error(`FAIL: ${failures.length} check(s) failed:\n  - ${failures.join("\n  - ")}`);
  process.exit(1);
}
console.log("PASS: cancellation frees a place, moves nobody, and can be rejoined.");
