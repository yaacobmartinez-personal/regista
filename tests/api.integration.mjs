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
  unconfirmed: `${P}unconfirmed@example.test`,
  fresh: `${P}fresh@example.test`,
  resettable: `${P}resettable@example.test`,
  founder: `${P}founder@example.test`,
};
const RAW_STRANGER_TOKEN = randomBytes(16).toString("base64url");
const RAW_VERIFY_TOKEN = randomBytes(16).toString("base64url");
const RAW_RESET_TOKEN = randomBytes(16).toString("base64url");
const RAW_SECOND_RESET_TOKEN = randomBytes(16).toString("base64url");
const RAW_INVITE_TOKEN = randomBytes(16).toString("base64url");
const sha256 = (v) => createHash("sha256").update(v).digest("hex");

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
  await prisma.invitation.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await prisma.verificationToken.deleteMany({ where: { identifier: { startsWith: P } } });
  await prisma.passwordResetToken.deleteMany({ where: { identifier: { startsWith: P } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: P } } });

  const passwordHash = await hash(PASSWORD);
  const user = (email, name) =>
    prisma.user.create({ data: { email, name, passwordHash, emailVerified: new Date() } });

  // Signed up but never confirmed: cannot sign in, and its address is claimable.
  await prisma.user.create({
    data: { email: EMAIL.unconfirmed, name: "Api Unconfirmed", passwordHash },
  });
  await prisma.verificationToken.create({
    data: {
      identifier: EMAIL.unconfirmed,
      token: sha256(RAW_VERIFY_TOKEN),
      tenantId: null, // a personal account: nothing to activate
      expiresAt: new Date(Date.now() + 864e5),
    },
  });
  await prisma.passwordResetToken.createMany({
    data: [
      { identifier: EMAIL.resettable, token: sha256(RAW_RESET_TOKEN), expiresAt: new Date(Date.now() + 36e5) },
      // A second outstanding link for the same account: spending one must kill it.
      { identifier: EMAIL.resettable, token: sha256(RAW_SECOND_RESET_TOKEN), expiresAt: new Date(Date.now() + 36e5) },
    ],
  });

  const [admin, staff, rival, attendee, stranger] = await Promise.all([
    user(EMAIL.admin, "Api Admin"),
    user(EMAIL.staff, "Api Staff"),
    user(EMAIL.rival, "Api Rival"),
    user(EMAIL.attendee, "Api Attendee"),
    user(EMAIL.stranger, "Api Stranger"),
    user(EMAIL.resettable, "Api Resettable"),
    user(EMAIL.founder, "Api Founder"),
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
  const attendeeToken2 = await login(EMAIL.founder);

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

  console.log("\nsigning up says the same thing about every address");
  const freshSignup = await req("POST", "/mobile/auth/signup", {
    body: { email: EMAIL.fresh, password: "a-good-password", name: "Api Fresh" },
  });
  const takenSignup = await req("POST", "/mobile/auth/signup", {
    body: { email: EMAIL.admin, password: "a-good-password", name: "Not The Admin" },
  });
  const claimableSignup = await req("POST", "/mobile/auth/signup", {
    body: { email: EMAIL.unconfirmed, password: "a-good-password", name: "Api Unconfirmed" },
  });
  check("a new address is accepted", [freshSignup.status, freshSignup.body], [200, { ok: true }]);
  // No mail provider is configured here, which is how the deployment runs until
  // a sending domain is verified — and sendEmail throws rather than logging in
  // production. Signup must survive that: the account exists, and resending is
  // the way back to it.
  check(
    "...even with no mail provider to send the confirmation",
    (await prisma.user.count({ where: { email: EMAIL.fresh } })),
    1,
  );
  check("a new account gets no organization", (await prisma.membership.count({
    where: { user: { email: EMAIL.fresh } },
  })), 0);
  check(
    "an address that already has a confirmed account answers identically",
    [takenSignup.status, takenSignup.body],
    [200, { ok: true }],
  );
  check(
    "so does one that was signed up for but never confirmed",
    [claimableSignup.status, claimableSignup.body],
    [200, { ok: true }],
  );
  check(
    "the confirmed account's password was not overwritten",
    (await req("POST", "/mobile/auth/login", { body: { email: EMAIL.admin, password: PASSWORD } })).status,
    200,
  );

  console.log("\nconfirming an address");
  check(
    "an unconfirmed account cannot sign in",
    (await req("POST", "/mobile/auth/login", { body: { email: EMAIL.unconfirmed, password: PASSWORD } })).status,
    401,
  );
  const verified = await req("POST", "/mobile/auth/verify", { body: { token: RAW_VERIFY_TOKEN } });
  check("the link confirms it and signs them in", verified.status, 200);
  check("...as the right account", verified.body.user.email, EMAIL.unconfirmed);
  check(
    "the token it hands back works",
    (await req("GET", "/mobile/me", { token: verified.body.token })).status,
    200,
  );
  check(
    "...and reports the address as confirmed",
    (await req("GET", "/mobile/me", { token: verified.body.token })).body.user.emailVerified,
    true,
  );
  check(
    "the link cannot be spent twice",
    (await req("POST", "/mobile/auth/verify", { body: { token: RAW_VERIFY_TOKEN } })).status,
    400,
  );

  console.log("\nasking for a password reset tells you nothing");
  const knownAddress = await req("POST", "/mobile/auth/forgot-password", { body: { email: EMAIL.resettable } });
  const unknownAddress = await req("POST", "/mobile/auth/forgot-password", { body: { email: `${P}nobody@example.test` } });
  check("a known address is accepted", [knownAddress.status, knownAddress.body], [200, { ok: true }]);
  check(
    "an address with no account answers exactly the same",
    [unknownAddress.status, unknownAddress.body],
    [200, { ok: true }],
  );

  console.log("\nresetting a password ends every other session");
  const beforeReset = await login(EMAIL.resettable);
  check("the old password works beforehand", (await req("GET", "/mobile/me", { token: beforeReset })).status, 200);
  const reset = await req("POST", "/mobile/auth/reset-password", {
    body: { token: RAW_RESET_TOKEN, password: "a-brand-new-password" },
  });
  check("the link sets the new password and signs in", reset.status, 200);
  check(
    "the session it hands back works",
    (await req("GET", "/mobile/me", { token: reset.body.token })).status,
    200,
  );
  check(
    "the session held before the reset does not",
    (await req("GET", "/mobile/me", { token: beforeReset })).status,
    401,
  );
  check(
    "the new password signs in",
    (await req("POST", "/mobile/auth/login", { body: { email: EMAIL.resettable, password: "a-brand-new-password" } })).status,
    200,
  );
  check(
    "the old one does not",
    (await req("POST", "/mobile/auth/login", { body: { email: EMAIL.resettable, password: PASSWORD } })).status,
    401,
  );
  check(
    "the spent link cannot be reused",
    (await req("POST", "/mobile/auth/reset-password", { body: { token: RAW_RESET_TOKEN, password: "another-one-entirely" } })).status,
    400,
  );
  check(
    "and the other link outstanding for that account is dead too",
    (await req("POST", "/mobile/auth/reset-password", { body: { token: RAW_SECOND_RESET_TOKEN, password: "another-one-entirely" } })).status,
    400,
  );

  console.log("\nthe team is admins-only, and cannot be left without one");
  const team = await req("GET", `${orgPath}/team`, { token: adminToken });
  check("an admin sees the team", team.status, 200);
  check("staff do not", (await req("GET", `${orgPath}/team`, { token: staffToken })).status, 403);
  check(
    "the member list names everyone, and marks the viewer",
    team.body.members.map((m) => [m.email, m.role, m.isSelf]),
    [[EMAIL.admin, "ADMIN", true], [EMAIL.staff, "STAFF", false]],
  );
  check("there is one admin", team.body.adminCount, 1);

  const adminMembership = team.body.members.find((m) => m.email === EMAIL.admin).id;
  const staffMembership = team.body.members.find((m) => m.email === EMAIL.staff).id;

  // The guard that matters: an organization with no admin has no way back in,
  // because every route that could appoint one requires an admin.
  const soleDemotion = await req("PATCH", `${orgPath}/team/members/${adminMembership}`, {
    token: adminToken,
    body: { role: "STAFF" },
  });
  check("the only admin cannot demote themselves", soleDemotion.status, 409);
  check("...and is told why, so the app can say what to do", soleDemotion.body.reason, "last_admin");
  const soleRemoval = await req("DELETE", `${orgPath}/team/members/${adminMembership}`, { token: adminToken });
  check("nor leave", soleRemoval.status, 409);
  check("...for the same reason", soleRemoval.body.reason, "last_admin");
  check(
    "they are still an admin afterwards",
    (await prisma.membership.count({ where: { tenantId: f.home.id, role: "ADMIN" } })),
    1,
  );

  check(
    "promoting someone else works",
    (await req("PATCH", `${orgPath}/team/members/${staffMembership}`, {
      token: adminToken,
      body: { role: "ADMIN" },
    })).body.member.role,
    "ADMIN",
  );
  check(
    "...and now the first admin may step down",
    (await req("PATCH", `${orgPath}/team/members/${adminMembership}`, {
      token: adminToken,
      body: { role: "STAFF" },
    })).status,
    200,
  );
  // Put it back: later checks in this suite act as an admin.
  await prisma.membership.update({ where: { id: adminMembership }, data: { role: "ADMIN" } });
  await prisma.membership.update({ where: { id: staffMembership }, data: { role: "STAFF" } });
  check(
    "a membership from another organization does not resolve",
    (await req("DELETE", `/mobile/orgs/${P}rival/team/members/${staffMembership}`, { token: rivalToken })).status,
    404,
  );

  console.log("\ninvitations go to the address on them, and nowhere else");
  const invited = await req("POST", `${orgPath}/team/invitations`, {
    token: adminToken,
    body: { email: `${P}invitee@example.test`, role: "STAFF" },
  });
  // No mail provider here, so the row exists but nobody was told — which is a
  // 502 precisely so the admin knows to revoke and try again.
  check("a failed send is reported, not swallowed", invited.status, 502);
  check("...and the invitation it made is named", invited.body.invitation.email, `${P}invitee@example.test`);
  check(
    "inviting somebody already on the team says so instead",
    (await req("POST", `${orgPath}/team/invitations`, {
      token: adminToken,
      body: { email: EMAIL.staff, role: "STAFF" },
    })).body.alreadyMember,
    true,
  );

  const liveInvite = await prisma.invitation.findFirst({
    where: { tenantId: f.home.id, email: `${P}invitee@example.test` },
    select: { id: true },
  });
  // A known token for an invitation nobody can read the raw value of otherwise.
  await prisma.invitation.update({
    where: { id: liveInvite.id },
    data: { token: sha256(RAW_INVITE_TOKEN) },
  });
  const wrongPerson = await req("POST", "/mobile/invitations/accept", {
    token: adminToken,
    body: { token: RAW_INVITE_TOKEN },
  });
  check("a forwarded invitation cannot be accepted by somebody else", wrongPerson.status, 403);
  check("...and says why", wrongPerson.body.reason, "email_mismatch");
  check(
    "nobody was added by the attempt",
    (await prisma.membership.count({ where: { tenantId: f.home.id } })),
    2,
  );
  check(
    "staff cannot invite at all",
    (await req("POST", `${orgPath}/team/invitations`, {
      token: staffToken,
      body: { email: `${P}nope@example.test`, role: "STAFF" },
    })).status,
    403,
  );
  check(
    "revoking an invitation from another organization does not resolve",
    (await req("DELETE", `/mobile/orgs/${P}rival/team/invitations/${liveInvite.id}`, { token: rivalToken })).status,
    404,
  );
  check(
    "revoking it as its own admin works",
    (await req("DELETE", `${orgPath}/team/invitations/${liveInvite.id}`, { token: adminToken })).status,
    200,
  );

  console.log("\nmaking an organization from the app");
  check(
    "a free address reads as available",
    (await req("GET", `/mobile/orgs/availability?slug=${P}brand-new`, { token: attendeeToken2 })).body,
    { slug: `${P}brand-new`, available: true },
  );
  check(
    "a taken one does not",
    (await req("GET", `/mobile/orgs/availability?slug=${P}home`, { token: attendeeToken2 })).body.reason,
    "taken",
  );
  check(
    "a reserved name does not",
    (await req("GET", "/mobile/orgs/availability?slug=app", { token: attendeeToken2 })).body.reason,
    "reserved",
  );
  check(
    "nor a malformed one",
    (await req("GET", "/mobile/orgs/availability?slug=No_Good", { token: attendeeToken2 })).body.reason,
    "invalid",
  );

  const created = await req("POST", "/mobile/orgs", {
    token: attendeeToken2,
    body: { name: "Brand New Org", slug: `${P}brand-new` },
  });
  check("creating it succeeds", created.status, 201);
  check("...as its admin", created.body.org.role, "ADMIN");
  check(
    "it is usable immediately, with no confirmation email to wait for",
    (await prisma.tenant.findUnique({ where: { slug: `${P}brand-new` }, select: { status: true } })).status,
    "ACTIVE",
  );
  check(
    "it shows up as theirs",
    (await req("GET", "/mobile/me", { token: attendeeToken2 })).body.orgs.map((o) => o.slug),
    [`${P}brand-new`],
  );
  check(
    "creating it again is refused rather than crashing",
    (await req("POST", "/mobile/orgs", {
      token: attendeeToken2,
      body: { name: "Brand New Org", slug: `${P}brand-new` },
    })).status,
    409,
  );
  check(
    "and the creation was recorded",
    (await prisma.auditLog.count({ where: { action: "CREATE_TENANT" } })) > 0,
    true,
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
