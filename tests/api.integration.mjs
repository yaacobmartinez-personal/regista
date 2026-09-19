/**
 * Mobile API — integration test. Needs a database and a production build
 * (`pnpm build`); boots the server itself on a spare port.
 *
 * Everything here is a guarantee that cannot be seen in the type system and
 * would not fail a unit test: who is allowed through, what a refusal looks
 * like, and which facts never leave the server. They were verified by hand when
 * the endpoints were written, which is worth exactly nothing the next time
 * somebody edits lib/api-auth.ts — so they are asserted against a real server
 * and a real database, over HTTP, the way the app reaches them.
 */
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import { createHmac, createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";

const PORT = Number(process.env.API_TEST_PORT ?? 3111);
const BASE = `http://127.0.0.1:${PORT}/api`;
const SECRET = "api-integration-test-secret";
const PASSWORD = "password123";

const prisma = new PrismaClient();
const failures = [];
let server;

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(
    `${ok ? "  ok  " : "  FAIL"} ${label}` +
      (ok ? "" : `  (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`),
  );
  if (!ok) failures.push(label);
}

async function req(method, path, { token, body, raw } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (raw) {
    return { status: response.status, text: await response.text(), headers: response.headers };
  }
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text };
  }
  return { status: response.status, body: json };
}

const login = async (email) => {
  const { body } = await req("POST", "/mobile/auth/login", { body: { email, password: PASSWORD } });
  if (!body.token) throw new Error(`could not sign in as ${email}: ${JSON.stringify(body)}`);
  return body.token;
};

// ── Fixtures ───────────────────────────────────────────────────────────────
// Prefixed so a developer's own seed data is never touched or depended on.
const P = "apitest-";
const EMAIL = {
  admin: `${P}admin@example.test`,
  staff: `${P}staff@example.test`,
  rival: `${P}rival@example.test`,
  attendee: `${P}attendee@example.test`,
  stranger: `${P}stranger@example.test`,
};
const RAW_STRANGER_TOKEN = randomBytes(16).toString("base64url");

async function seed() {
  // Order matters: audit logs restrict tenant deletes, so they go first.
  const tenants = await prisma.tenant.findMany({
    where: { slug: { startsWith: P } },
    select: { id: true },
  });
  const tenantIds = tenants.map((t) => t.id);
  await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.registration.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.event.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.membership.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: P } } });

  const passwordHash = await hash(PASSWORD);
  const user = (email, name) =>
    prisma.user.create({ data: { email, name, passwordHash, emailVerified: new Date() } });

  const [admin, staff, rival, attendee, stranger] = await Promise.all([
    user(EMAIL.admin, "Api Admin"),
    user(EMAIL.staff, "Api Staff"),
    user(EMAIL.rival, "Api Rival"),
    user(EMAIL.attendee, "Api Attendee"),
    user(EMAIL.stranger, "Api Stranger"),
  ]);

  const home = await prisma.tenant.create({
    data: { slug: `${P}home`, name: "Api Home", status: "ACTIVE" },
  });
  const rivalOrg = await prisma.tenant.create({
    data: { slug: `${P}rival`, name: "Api Rival Org", status: "ACTIVE" },
  });
  // Never confirmed its address: not usable, and not public.
  const pending = await prisma.tenant.create({
    data: { slug: `${P}pending`, name: "Api Pending", status: "PENDING" },
  });

  await prisma.membership.createMany({
    data: [
      { userId: admin.id, tenantId: home.id, role: "ADMIN" },
      { userId: staff.id, tenantId: home.id, role: "STAFF" },
      { userId: rival.id, tenantId: rivalOrg.id, role: "ADMIN" },
      // An admin of an organization that has not been confirmed.
      { userId: admin.id, tenantId: pending.id, role: "ADMIN" },
    ],
  });

  const event = await prisma.event.create({
    data: {
      tenantId: home.id,
      slug: "open-event",
      title: "Open Event",
      startsAt: new Date(Date.now() + 7 * 864e5),
      timezone: "UTC",
      capacity: 5,
      waitlistEnabled: true,
      status: "PUBLISHED",
    },
  });
  await prisma.event.create({
    data: {
      tenantId: home.id,
      slug: "draft-event",
      title: "Draft Event",
      startsAt: new Date(Date.now() + 7 * 864e5),
      timezone: "UTC",
      status: "DRAFT",
    },
  });

  // A place booked the web way — no account — belonging to someone else.
  await prisma.registration.create({
    data: {
      tenantId: home.id,
      eventId: event.id,
      email: EMAIL.stranger,
      name: "Api Stranger",
      status: "CONFIRMED",
      manageToken: createHash("sha256").update(RAW_STRANGER_TOKEN).digest("hex"),
      checkInToken: `${P}stranger-ticket`,
    },
  });

  return { admin, staff, rival, attendee, stranger, home, rivalOrg, pending, event };
}

// ── Token helpers, mirroring lib/mobile-auth.ts ────────────────────────────
function mintToken(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", SECRET).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

async function startServer() {
  server = spawn("node_modules/.bin/next", ["start", "--port", String(PORT)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AUTH_SECRET: SECRET,
      NEXT_PUBLIC_ROOT_DOMAIN: `127.0.0.1:${PORT}`,
      TRUSTED_PROXY_COUNT: "0",
      // No mail provider: sendTemplate skips, which is what we want here.
      RESEND_API_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stderr.on("data", (d) => {
    const line = String(d);
    if (/Error|error/.test(line)) process.stderr.write(`  [server] ${line}`);
  });

  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/public/orgs/__probe__`);
      if (r.status === 404) return; // routed and answered: it is up
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("the server did not become ready in time");
}

async function run() {
  const f = await seed();
  await startServer();

  const adminToken = await login(EMAIL.admin);
  const staffToken = await login(EMAIL.staff);
  const rivalToken = await login(EMAIL.rival);
  const attendeeToken = await login(EMAIL.attendee);

  const orgPath = `/mobile/orgs/${P}home`;
  const eventPath = `${orgPath}/events/open-event`;

  console.log("\nwho gets in at all");
  check("no credential is refused", (await req("GET", "/mobile/orgs")).status, 401);
  check(
    "a token signed with another key is refused",
    (await req("GET", "/mobile/orgs", { token: `${Buffer.from('{"sub":"x","ver":0,"exp":9999999999999}').toString("base64url")}.forged` })).status,
    401,
  );
  check(
    "an expired token is refused",
    (await req("GET", "/mobile/orgs", {
      token: mintToken({ sub: f.admin.id, ver: 0, exp: Date.now() - 1 }),
    })).status,
    401,
  );
  check(
    "a token naming a user who does not exist is refused",
    (await req("GET", "/mobile/orgs", {
      token: mintToken({ sub: "no-such-user", ver: 0, exp: Date.now() + 60_000 }),
    })).status,
    401,
  );
  check(
    "a token from a stale tokenVersion is refused",
    (await req("GET", "/mobile/orgs", {
      token: mintToken({ sub: f.admin.id, ver: 99, exp: Date.now() + 60_000 }),
    })).status,
    401,
  );
  check("a current token is accepted", (await req("GET", "/mobile/orgs", { token: adminToken })).status, 200);

  console.log("\nrevoking every session for an account");
  await prisma.user.update({ where: { id: f.attendee.id }, data: { tokenVersion: { increment: 1 } } });
  check(
    "the token stops working the moment tokenVersion moves",
    (await req("GET", "/mobile/tickets", { token: attendeeToken })).status,
    401,
  );
  const freshAttendeeToken = await login(EMAIL.attendee);
  check(
    "signing in again works and the password is untouched",
    (await req("GET", "/mobile/tickets", { token: freshAttendeeToken })).status,
    200,
  );

  console.log("\norganizations cannot be enumerated");
  const nonMember = await req("GET", `/mobile/orgs/${P}home/events`, { token: rivalToken });
  const missing = await req("GET", "/mobile/orgs/does-not-exist-at-all/events", { token: rivalToken });
  const unconfirmed = await req("GET", `/mobile/orgs/${P}pending/events`, { token: adminToken });
  check("a non-member is refused", nonMember.status, 403);
  check("an organization that does not exist answers the same status", missing.status, 403);
  check("an unconfirmed organization answers the same status", unconfirmed.status, 403);
  // The point of the previous three: the bodies must not tell them apart.
  check("...and the same body, so none of them can be told apart", [
    JSON.stringify(nonMember.body) === JSON.stringify(missing.body),
    JSON.stringify(missing.body) === JSON.stringify(unconfirmed.body),
  ], [true, true]);

  console.log("\nrole is enforced where it matters");
  check("staff may read an event", (await req("GET", eventPath, { token: staffToken })).status, 200);
  check("staff may not delete one", (await req("DELETE", eventPath, { token: staffToken })).status, 403);
  check(
    "an admin of another organization may not either",
    (await req("DELETE", eventPath, { token: rivalToken })).status,
    403,
  );

  console.log("\none organization's data never resolves for another");
  const mine = await req("GET", `${eventPath}/attendees`, { token: adminToken });
  const stranger = mine.body.attendees[0];
  check("the admin can see the attendee list", mine.status, 200);
  // The rival is a full admin of their own organization, so they clear the
  // membership gate. What stops them is that every write is matched on
  // (id, tenantId): a real registration id from somewhere else simply does not
  // resolve, and answers exactly as a made-up one would.
  const borrowedId = await req("POST", `/mobile/orgs/${P}rival/events/open-event/attendees/${stranger.id}/checkin`, {
    token: rivalToken,
    body: { checkedIn: true },
  });
  const inventedId = await req("POST", `/mobile/orgs/${P}rival/events/open-event/attendees/no-such-registration/checkin`, {
    token: rivalToken,
    body: { checkedIn: true },
  });
  check("a registration id from another organization does not resolve", borrowedId.status, 404);
  check(
    "...and is indistinguishable from an id that never existed",
    JSON.stringify(borrowedId.body) === JSON.stringify(inventedId.body),
    true,
  );
  check(
    "the attendee was not checked in by it",
    (await prisma.registration.findUnique({ where: { id: stranger.id }, select: { checkedInAt: true } })).checkedInAt,
    null,
  );
  check(
    "a ticket from this organization is invalid when another scans it",
    (await req("POST", "/mobile/checkin", {
      token: rivalToken,
      body: { slug: `${P}rival`, code: `${P}stranger-ticket` },
    })).body.outcome,
    "invalid",
  );

  console.log("\nsigning up for an event, as an account");
  const registered = await req("POST", `${eventPath}/register`, {
    token: freshAttendeeToken,
    // A body that tries to register somebody else: the address must be ignored.
    body: { name: "Api Attendee", email: EMAIL.stranger },
  });
  check("the sign-up succeeds", registered.body.outcome, "confirmed");
  check(
    "the place is booked to the account's own address, not the body's",
    registered.body.ticket.email,
    EMAIL.attendee,
  );
  check(
    "signing up again reports the place already held",
    (await req("POST", `${eventPath}/register`, { token: freshAttendeeToken, body: { name: "Api Attendee" } })).body.outcome,
    "duplicate",
  );

  console.log("\nsomebody else's ticket cannot be claimed or read");
  const imported = await req("POST", "/mobile/tickets/import", {
    token: freshAttendeeToken,
    body: { token: RAW_STRANGER_TOKEN },
  });
  check("a forwarded confirmation link is refused", imported.status, 403);
  check("...and says why, so the app can explain it", imported.body.reason, "email_mismatch");
  check(
    "reading it directly is a plain not-found",
    (await req("GET", `/mobile/tickets/${stranger.id}`, { token: freshAttendeeToken })).status,
    404,
  );
  check(
    "cancelling it is too",
    (await req("POST", `/mobile/tickets/${stranger.id}/cancel`, { token: freshAttendeeToken })).status,
    404,
  );
  check(
    "the ticket list holds only this account's own place",
    (await req("GET", "/mobile/tickets", { token: freshAttendeeToken })).body.tickets.map((t) => t.email),
    [EMAIL.attendee],
  );

  console.log("\nthe public reads are public, and show only what is published");
  check("no token is needed", (await req("GET", `/public/orgs/${P}home`)).status, 200);
  check(
    "an unconfirmed organization is not served at all",
    (await req("GET", `/public/orgs/${P}pending`)).status,
    404,
  );
  check(
    "a draft event is not listed",
    (await req("GET", `/public/orgs/${P}home/events`)).body.events.map((e) => e.slug),
    ["open-event"],
  );
  check(
    "nor reachable by name",
    (await req("GET", `/public/orgs/${P}home/events/draft-event`)).status,
    404,
  );
  check(
    "seats left reflect the sign-up that just happened",
    (await req("GET", `/public/orgs/${P}home/events/open-event`)).body.event.remaining,
    3,
  );

  console.log("\nthe export carries personal data, and says so");
  const csv = await req("GET", `${eventPath}/attendees/export`, { token: adminToken, raw: true });
  check("an organizer can download it", csv.status, 200);
  check("it is never cached", csv.headers.get("cache-control"), "no-store");
  check(
    "another organization cannot",
    (await req("GET", `/mobile/orgs/${P}rival/events/open-event/attendees/export`, { token: rivalToken, raw: true })).status,
    404,
  );
  check(
    "the download is recorded against the person who took it",
    (await prisma.auditLog.count({
      where: { tenantId: f.home.id, action: "EXPORT_ATTENDEES", actorUserId: f.admin.id },
    })) > 0,
    true,
  );
}

try {
  await run();
} catch (error) {
  console.error("\nthe suite could not finish:", error);
  failures.push("suite crashed");
} finally {
  if (server) server.kill("SIGTERM");
  await prisma.$disconnect();
}

if (failures.length > 0) {
  console.log(`\nFAIL: ${failures.length} check(s) failed:\n  - ${failures.join("\n  - ")}`);
  process.exit(1);
}
console.log("\nPASS: the API lets through exactly who it should, and no more.");
