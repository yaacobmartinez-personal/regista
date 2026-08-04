/**
 * QR check-in — integration test. Needs a running database (`pnpm db:up`).
 *
 * Check-in by ticket is invisible in the type system and only observable as
 * database state, so the guarantees are asserted here: a ticket checks in once
 * and only once (idempotent), a ticket for another event or another tenant does
 * not silently check someone in, cancelled/waitlisted places are surfaced rather
 * than admitted, and an erased ticket stops resolving.
 *
 * Mirrors performCheckIn in lib/checkin.ts rather than importing it — that module
 * pulls in Next-only APIs behind `@/` aliases that plain Node can't resolve. The
 * copy is short and annotated with the file it tracks; keep them in step.
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

const prisma = new PrismaClient();
const TENANT_SLUG = "acme";
const failures = [];

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}` + (ok ? "" : `  (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`));
  if (!ok) failures.push(label);
}

const token = () => randomBytes(16).toString("base64url");

/** Mirrors performCheckIn in lib/checkin.ts. */
async function performCheckIn(actingTenantId, rawToken, requireEventId) {
  const r = await prisma.registration.findUnique({
    where: { checkInToken: rawToken },
    select: {
      id: true, status: true, checkedInAt: true, anonymizedAt: true,
      tenant: { select: { id: true, status: true } },
      event: { select: { id: true } },
    },
  });
  if (!r || r.anonymizedAt || r.tenant.status !== "ACTIVE") return "invalid";
  if (r.tenant.id !== actingTenantId) return "invalid";
  if (requireEventId && r.event.id !== requireEventId) return "wrong_event";
  if (r.status === "CANCELLED") return "cancelled";
  if (r.status === "WAITLIST") return "waitlist";
  if (r.checkedInAt) return "already";
  const changed = await prisma.registration.updateMany({
    where: { id: r.id, checkedInAt: null },
    data: { checkedInAt: new Date() },
  });
  return changed.count === 1 ? "checked_in" : "already";
}

const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } });
if (!tenant) throw new Error(`Seed tenant "${TENANT_SLUG}" missing — run pnpm db:seed`);
const other = await prisma.tenant.findFirst({ where: { slug: { not: TENANT_SLUG } } });

const slug = "checkin-test";
await prisma.event.deleteMany({ where: { tenantId: tenant.id, slug } });
const event = await prisma.event.create({
  data: {
    tenantId: tenant.id, slug, title: "Check-in test",
    startsAt: new Date(Date.now() + 86_400_000), timezone: "UTC",
    capacity: 5, waitlistEnabled: true, status: "PUBLISHED",
  },
});
const otherEvent = await prisma.event.create({
  data: {
    tenantId: tenant.id, slug: "checkin-test-other", title: "Other",
    startsAt: new Date(Date.now() + 86_400_000), timezone: "UTC", status: "PUBLISHED",
  },
});

const mk = async (status, checkedIn = false) => {
  const t = token();
  await prisma.registration.create({
    data: {
      tenantId: tenant.id, eventId: event.id, email: `${t.slice(0, 6)}@checkin.test`,
      name: "Attendee", status, checkInToken: t,
      checkedInAt: checkedIn ? new Date() : null,
    },
  });
  return t;
};

const confirmed = await mk("CONFIRMED");
const waitlisted = await mk("WAITLIST");
const cancelledTok = await mk("CANCELLED");
const erasedTok = await mk("CONFIRMED");

console.log("\ncheck-in by ticket");
check("first scan checks in", await performCheckIn(tenant.id, confirmed, event.id), "checked_in");
check("second scan is idempotent", await performCheckIn(tenant.id, confirmed, event.id), "already");
check("wrong event is refused", await performCheckIn(tenant.id, confirmed, otherEvent.id), "wrong_event");
check("waitlisted is surfaced, not admitted", await performCheckIn(tenant.id, waitlisted, event.id), "waitlist");
check("cancelled is surfaced, not admitted", await performCheckIn(tenant.id, cancelledTok, event.id), "cancelled");
check("unknown token is invalid", await performCheckIn(tenant.id, "not-a-real-token", event.id), "invalid");

if (other) {
  check("another tenant can't use this ticket", await performCheckIn(other.id, confirmed), "invalid");
}

// Erase the fourth registration's ticket, as the erasure action does.
await prisma.registration.updateMany({
  where: { checkInToken: erasedTok },
  data: { checkInToken: null, anonymizedAt: new Date(), name: null, email: `deleted@anon.invalid` },
});
check("erased ticket stops resolving", await performCheckIn(tenant.id, erasedTok, event.id), "invalid");

await prisma.event.deleteMany({ where: { id: { in: [event.id, otherEvent.id] } } });
await prisma.$disconnect();

console.log("");
if (failures.length > 0) {
  console.error(`FAIL: ${failures.length} check(s) failed:\n  - ${failures.join("\n  - ")}`);
  process.exit(1);
}
console.log("PASS: a ticket checks in once, and only within its own event and tenant.");
