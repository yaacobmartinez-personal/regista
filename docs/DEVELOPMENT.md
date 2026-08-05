# Thingstead — Developer Guide

Architecture, conventions, and gotchas for working on Thingstead. For the product framing see
[business-explainer.html](business-explainer.html); for scope see [REQUIREMENTS.md](REQUIREMENTS.md).

---

## 1. Architecture at a glance

Thingstead is a **single full-stack Next.js app** (no separate API service). Business logic
runs in **Server Actions** (dashboard mutations) and **Route Handlers** (public endpoints,
webhooks, exports). One Postgres database backs everything, with strict per-tenant isolation
enforced in application code.

Three "surfaces", chosen by subdomain:

| Subdomain | Surface | Route folder | Auth |
| --- | --- | --- | --- |
| apex / `www` | Marketing + signup | `app/home` | none |
| `app.` | Organizer dashboard | `app/app` | required |
| `<tenant>.` | Tenant public pages | `app/[domain]` | none |

---

## 2. Subdomain routing (`proxy.ts`)

Next.js 16 renamed the `middleware` convention to **`proxy`**. Routing lives in
[`proxy.ts`](../proxy.ts) (default export named `proxy`). It is **edge-safe**: no DB or auth
imports — it only rewrites the URL based on the `Host` header.

```
apex / www        ->  rewrite to /home + path
app.<root>        ->  rewrite to /app + path
<tenant>.<root>   ->  rewrite to /<tenant> + path   (matches app/[domain])
```

The root domain comes from `NEXT_PUBLIC_ROOT_DOMAIN` (default `localhost:3000`). Reserved
first-party subdomains (`app`, `www`) never resolve to a tenant.

**`*.localhost` in development:** modern browsers resolve any `*.localhost` name to
`127.0.0.1` with no hosts-file edits. So `app.localhost:3000` and `acme.localhost:3000` just
work. The `proxy.ts` matcher skips `/api`, Next internals, and files with an extension.

> Because every request is rewritten, there is no root `app/page.tsx` — the apex renders
> `app/home/page.tsx`.

---

## 3. Multitenancy & data isolation

**The isolation rules (critical — do not break):**

1. The **active tenant is derived server-side** — from the subdomain (public pages) or the
   authenticated path segment (dashboard). Never from a client-supplied `tenantId` in a body.
2. **Every tenant-scoped query is filtered by `tenantId`.** Fetch objects as
   `where: { id, tenantId }`, never by `id` alone.
3. Authorization is resolved **from the database on every request** — see below.

### The `authz` helper ([`lib/authz.ts`](../lib/authz.ts))

`requireMembership(tenantSlug, minRole?)` is the gate for every dashboard action:

- Requires an authenticated session (else redirects to `/login`).
- Looks up the caller's `Membership` for that tenant **in the DB** and returns
  `{ userId, tenant, role }`.
- A non-member (or insufficient role) gets `notFound()` — a 404 with **no existence
  disclosure**, which also blocks cross-tenant (IDOR) access.

Because membership/role is read per request (the JWT carries **identity only**), removing a
member or changing a role takes effect immediately — no waiting for token expiry.

`myMemberships()` returns all tenants the current user belongs to (for the org switcher).

---

## 4. Authentication ([`lib/auth.ts`](../lib/auth.ts))

- **NextAuth v5** (`next-auth@beta`) with the **Credentials** provider (email + password).
- Passwords hashed/verified with **`@node-rs/argon2`** (prebuilt binaries — no native build
  step on Windows).
- **Session strategy: JWT**, storing only the user id (`sub`). No memberships/roles in the
  token — those are always resolved from the DB (see §3).
- **Cookie scoping:** the session cookie is **host-only** (no `domain` attribute set), so it
  is scoped to `app.<root>` where login happens and is never sent to tenant public
  subdomains. Cookies are `HttpOnly` + `SameSite=Lax` by Auth.js default — we don't set
  them ourselves. `Secure` follows the request protocol rather than the environment, so it
  only holds if every request reaching Auth.js is HTTPS; set `useSecureCookies` or `AUTH_URL`
  explicitly before production.
- **An address nobody has confirmed is not an account.** `authorize` refuses sign-in while
  `emailVerified` is null, and signup and invitation acceptance will both claim such a
  record — overwriting its password. That is deliberate: without it, registering someone
  else's address gave you a working login for it and locked them out permanently, since
  there is no password-reset flow. A *confirmed* account's password is never overwritten.
- **`requireMembership` also requires the tenant to be `ACTIVE`**, so an unconfirmed
  organization cannot be used while it still counts as an abandoned signup.
- `trustHost: true` so local subdomains / proxies are trusted.
- Login uses a Server Action ([`app/app/login/actions.ts`](../app/app/login/actions.ts))
  that calls `signIn("credentials", ...)`; invalid credentials return a generic message (no
  user enumeration).

There is **no Prisma adapter** — with Credentials + JWT it isn't needed; users are managed
directly via Prisma.

---

## 5. Data model ([`prisma/schema.prisma`](../prisma/schema.prisma))

| Model | Purpose |
| --- | --- |
| `Tenant` | Organization. `slug` = subdomain; `status` `PENDING`→`ACTIVE` after email verify |
| `User` | Global identity (email, `passwordHash`, `emailVerified`) |
| `Membership` | Links a `User` to a `Tenant` with a `Role` (`ADMIN` \| `STAFF`) |
| `Invitation` | Teammate invites — single-use, expiring, email-bound tokens |
| `Event` | `DRAFT`/`PUBLISHED`/`CLOSED`, optional `capacity` + `waitlistEnabled` |
| `Registration` | Public sign-up; `anonymizedAt` marks in-system anonymisation (see §8d) |
| `AuditLog` | Records PII access (exports, deletions) for accountability |
| `VerificationToken` | Owner email verification at signup |

Every tenant-scoped table carries `tenantId` and is indexed on it. Key uniqueness:
`Tenant.slug`, `(Event.tenantId, slug)`, `(Registration.eventId, email)`,
`(Membership.userId, tenantId)`.

---

## 6. Environment variables

Copy `.env.example` to `.env`. Keys:

| Var | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection (points at the Docker container in dev) |
| `AUTH_SECRET` | NextAuth signing secret (`openssl rand -base64 32`) |
| `NEXT_PUBLIC_ROOT_DOMAIN` | Root domain for subdomain resolution (`localhost:3000` in dev) |
| `RESEND_API_KEY` | Email provider key. Blank logs to the console in development; **in production a blank key throws** rather than silently logging every message |
| `EMAIL_FROM` | Default From address for outbound email |
| `TRUSTED_PROXY_COUNT` | Number of reverse proxies in front of the app; rate limiting reads the client address that many entries from the right of `X-Forwarded-For`. `0` (default) ignores the header entirely, which is the safe choice when directly exposed |
| `EMAIL_DEBUG_HTML` | Dev only: also print the rendered HTML to the console |
| `EMAIL_DEBUG_TOKENS` | Dev only: print verification/invite links with their token intact so you can follow them locally. Tokens are redacted without it |

Secrets live only in `.env` (gitignored). Never log tokens or registrant PII: the console
email transport redacts tokens and refuses to run in production at all.

Attendee search terms are held in a short-lived httpOnly cookie rather than the query
string — see `attendees/filter-actions.ts`. A filtered guest list is therefore not
shareable by URL, which for a list of people's contact details is the right trade.

> **Known deviation.** Verification and invitation links still carry their token as a query
> parameter, because that is what a link in an email can express. The exposure is reduced
> rather than removed: `Referrer-Policy` keeps it out of the `Referer` header, verification
> strips the token from the address bar once used, and neither link does anything until an
> explicit action. It can still appear in server access logs. Moving to a token exchanged
> for a session on first view would close that, and is recorded in
> [AUDIT-FINDINGS.md](AUDIT-FINDINGS.md).

---

## 7. Database workflow

Postgres runs in Docker ([`docker-compose.yml`](../docker-compose.yml)). **Docker Desktop
must be started manually** first — its engine cannot be launched from a shell command.

```bash
docker compose up -d     # start Postgres (pnpm db:up)
pnpm db:migrate          # create/apply a migration after schema edits
pnpm db:seed             # seed demo tenants + accounts
pnpm db:studio           # browse data in Prisma Studio
pnpm db:reset            # drop + re-migrate + re-seed
```

The seed ([`prisma/seed.mjs`](../prisma/seed.mjs)) is idempotent (upserts) and creates two
tenants (`acme`, `beta`) so you can test isolation. See the README for login details.

---

## 8. Conventions & gotchas (read this)

- **Prisma is pinned to v6, not v7.** Prisma 7 removed `url` from the datasource block
  (requires driver-adapters + a `prisma.config.ts`). We use the classic
  `url = env("DATABASE_URL")` setup on `prisma@^6` / `@prisma/client@^6`. Only upgrade
  deliberately, migrating the config as part of that work.
- **`tsx` is broken in this environment** (esbuild `TransformError` / native crash), and the
  dependency has been removed so nobody reaches for it. Anything esbuild-based — Vitest
  included — will hit the same wall. Scripts are plain Node ESM (`prisma/seed.mjs`,
  `prisma/prune.mjs`); tests use `tsc` + `node:test` (§8k).
- **Slug rules live in [`lib/slug.ts`](../lib/slug.ts), which must stay import-free** so the
  browser and the server run the same code — the client previews the address, the server
  decides it, and three separate copies meant the preview could lie. It is also what makes
  the module unit-testable.
- **Shared class strings are in [`components/ui.ts`](../components/ui.ts)**, and
  `app/globals.css` gives every interactive element a zero-specificity focus outline. The
  app suppresses the browser default in places, so anything that forgot to add a ring had no
  visible focus at all — about forty elements were in that state.
- **URLs come from [`lib/urls.ts`](../lib/urls.ts)**, not from re-deriving the root domain
  and guessing the scheme inline. That guess was written out eight times and was wrong for
  `127.0.0.1` and `.local` hosts.
- **Routing file is `proxy.ts`, not `middleware.ts`** (Next 16 convention). Keep it
  edge-safe — no DB/auth imports.
- **A `"use server"` module may only export async functions.** Exporting a `const` (or
  anything else) from an actions file breaks *all* its exports with a confusing "module has
  no exports at all" build error. Put shared constants/types in a sibling plain module —
  see [`app/home/signup/shared.ts`](../app/home/signup/shared.ts).
- **Docker Desktop can't be started programmatically** — start it from the desktop before
  DB commands.
- **Windows PowerShell 5.1 has no `&&`.** Run commands separately, or chain with `;` (which
  does not stop on failure).
- **Password hashing = `@node-rs/argon2`** (argon2id). Prefer it over native `argon2`/bcrypt
  builds on Windows.
- Validate all input with **Zod**; never let a request set `tenantId`, `role`, `status`, or
  `checkedInAt` directly (no mass assignment).

---

## 8b. Signup & verification (M2)

Flow: apex `/signup` → creates `User` + **PENDING** `Tenant` + ADMIN `Membership` +
`VerificationToken` in one transaction → emails a link to `app.<root>/verify?token=…` →
redemption sets the tenant `ACTIVE` and marks the token used → user signs in.

- **Tokens** ([`lib/tokens.ts`](../lib/tokens.ts)): 256-bit random, emailed raw, stored only
  as a SHA-256 hash, single-use (`usedAt`), 24-hour expiry.
- **Email** ([`lib/email.ts`](../lib/email.ts)): one `sendEmail()` seam. With no
  `RESEND_API_KEY` it prints to the server console — copy the link from there in dev.
  Templates are React Email components (see §8g).
- **Rate limiting** ([`lib/rate-limit.ts`](../lib/rate-limit.ts)): in-process fixed window
  (signup 5/hr/IP, resend 3/15min/IP). No new infrastructure, but counters are per-instance
  and reset on restart — swap for Redis behind the same `rateLimit()` signature before
  running more than one instance.
- **Verification lives on the `app.` subdomain** so it shares the host the session cookie is
  scoped to. Redemption does *not* auto-sign-in: that would need a provider that trusts a
  token, so the user signs in with the password they just chose.
- **No account enumeration:** signing up with an existing email never overwrites that
  account's password and returns the same response as a fresh signup.
- A **PENDING** tenant's public pages 404 (`resolveActiveTenant` requires `ACTIVE`).
- An address held by a signup that was never confirmed is released once the confirmation
  window closes — but only if nothing was created under it. `slugAvailability` reports such
  an address as available, and `releaseAbandonedTenant` re-checks both conditions inside the
  delete, so a tenant that gained data or got verified in the meantime is left alone and a
  concurrent claim is a no-op rather than an error.

## 8c. Registration capacity (M3)

The one piece of M3 with real correctness risk is the last-place race. Two people
submitting at once must not both take the final seat.

`app/[domain]/[eventSlug]/actions.ts` runs the check inside a transaction that first takes a
row lock on the event:

```ts
await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${event.id} FOR UPDATE`;
```

Concurrent registrations for the same event then serialise behind that lock, so the
confirmed-count read cannot be stale. Without it, two transactions at READ COMMITTED both
see the last place as free.

This is verified, not assumed: a concurrency test fired 20 simultaneous attempts at a
5-place event. With the lock, exactly 5 were confirmed; with the lock removed as a control,
17 were confirmed. Re-run that comparison if this transaction is ever refactored — a test
that only passes the "with lock" case can pass vacuously.

Duplicates rely on the `(eventId, email)` unique index; the action catches Prisma's `P2002`
and reports it as "already signed up" rather than failing. `P2028`/`P2034` (transaction
timeout or write conflict) are caught too and reported as "try again in a moment" — the lock
serialises sign-ups by design, so a rush at the moment registration opens is contention
rather than a fault.

**Capacity and the waitlist:**

- Capacity cannot be set below the number of people already confirmed. Allowing it left the
  public page reading "Full" while the dashboard showed more registered than the limit.
- Raising capacity, or removing the limit, **promotes the longest-waiting people**
  (`promoteFromWaitlist`, under the same row lock). Without that the queue was decorative:
  everyone already waiting stayed put while later arrivals were confirmed ahead of them.
- **Cancelling does not promote anyone.** A registrant giving up their place frees the seat
  and stops there; who takes it is the organizer's call, made with the **Promote** button on
  the attendees page (`promoteRegistration`, under the same row lock, refused when the event
  is at capacity). This is a deliberate difference from the capacity-increase path above:
  raising a limit is the organizer already saying "let more people in", whereas a single
  seat coming free is not.

**Times that don't exist.** On the morning clocks go forward an hour never happens, so
`eventInputSchema` rejects a wall-clock time that isn't real in the chosen zone
(`wallClockExists`). Converting anyway shifted the event — an hour *earlier* than typed in
the Americas, a day earlier in Santiago. Ambiguous autumn times are accepted: they exist,
just twice.

## 8d. Attendees, export and erasure (M4)

Attendees belong to an event: `/o/<org>/events/<event>/attendees`.

- **CSV export** is a Route Handler (`attendees/export`). Every cell goes through
  [`lib/csv.ts`](../lib/csv.ts), which prefixes anything starting with `= + - @` or a
  control character with an apostrophe. Attendee names come from the public, so an
  unescaped export would hand a spreadsheet a live formula. Responses are `no-store`.
- **Erasure** (`eraseRegistration`) nulls the name and custom fields, sets
  `anonymizedAt`, and rewrites the email to `deleted+<id>@anon.invalid` — unique enough
  to satisfy the `(eventId, email)` index and not reversible. The row survives so
  capacity and attendance figures stay correct; the UI shows "Details erased" and the
  export writes `(erased)`.
- **Audit** ([`lib/audit.ts`](../lib/audit.ts)) records exports and erasures with the
  acting user. It stores identifiers only — never the personal data itself.
- Writes match on `(id, tenantId)` via `updateMany`/`findFirst`, so an id from another
  organization affects nothing. Cross-tenant attendee pages and exports return 404.

## 8e. Timezones

Each `Event` carries an IANA `timezone`; `startsAt`/`endsAt` are UTC instants.
[`lib/time.ts`](../lib/time.ts) converts between the two:

- `zonedInputToUtc` turns a `datetime-local` wall-clock value plus the event's zone into
  an instant. It applies the offset twice — the second pass corrects a first-pass result
  that landed on the other side of a DST boundary.
- `utcToZonedInput` renders an instant back into a form value, so editing round-trips.
- `formatInZone` / `zoneLabel` are used for *all* event-time display. Never call
  `toLocaleString` on an event time without passing the event's zone: that reintroduces
  the bug where organizer and attendee saw different hours.

Form values are computed **server-side** in the event's zone and passed to the client
component, which is why the datetime inputs need no hydration suppression.

## 8f. Redirects and the subdomain rewrite

A `redirect()` inside a **server action** is resolved against the route tree directly —
`proxy.ts` does not run for it. Dashboard paths like `/orgs` only exist as `/app/orgs`
after the rewrite, so such a redirect lands on a 404 (and can even match an unrelated
tenant route such as `app/[domain]`).

Where an action needs to send the user to a rewritten path, return the destination and
navigate on the client instead — see [`app/app/login/actions.ts`](../app/app/login/actions.ts)
and the `useEffect` in its page. Page-level (non-action) redirects are fine: they reach the
browser as a real redirect and pass back through the proxy.

## 8g. Email (M5)

Templates live in [`emails/`](../emails) and are React Email components.
[`lib/email.ts`](../lib/email.ts) renders one to HTML and sends it with a plain-text
alternative via `sendTemplate()`.

- **Layout** ([`emails/layout.tsx`](../emails/layout.tsx)) is the shared shell: brand mark,
  heading, footer, and the preview line shown in the inbox list. Everything is inline
  styles and tables because email clients ignore stylesheets, and it is deliberately
  light-only — dark-mode support across clients is too inconsistent to half-apply.
- **Every template ships a matching `*Text()` function.** Keep the two in step; the text
  version is what the console transport prints and what text-only clients receive.
- **Event times come from `formatEventWhen`**, the same helper the public page uses, so an
  email can never disagree with the page about when something happens.
- **Watch JSX whitespace.** `{value} hours` can render as `24hours` once React inserts its
  separators. Where a value sits inside a sentence, build the whole string in one template
  literal instead.
- `EMAIL_DEBUG_HTML=1` makes the console transport print the rendered HTML as well as the
  text — useful while editing templates. Leave it unset otherwise, and never in production:
  the output contains recipient personal data.

**Before sending in production**, Resend needs a verified sending domain:

1. Add the domain in Resend and publish the DKIM, SPF, and DMARC records it gives you.
2. Set `EMAIL_FROM` to an address on that domain (`no-reply@yourdomain`).
3. Set `RESEND_API_KEY`. Until it is set, nothing is sent — messages only reach the console.

Sending from an unverified domain will be rejected or land in spam, so treat this as part
of the launch checklist rather than an afterthought.

## 8h. Team members and invitations (M6)

Team management lives at `/o/<org>/team` and is **ADMIN-only** — staff get the same
`notFound()` as a non-member, and the Team tab isn't rendered for them at all.

- **Invitations** ([`lib/invitations.ts`](../lib/invitations.ts)) are email-bound: holding
  the link is not enough, the accepting account must be that address. Tokens follow the same
  rules as verification (256-bit, SHA-256 at rest, expiring — 7 days here).
- **Redemption claims the invitation first**, with a conditional `updateMany` inside the
  transaction, so a concurrent second redemption is a no-op rather than a duplicate
  membership.
- **Accepting never changes an existing role** (`update: {}`). An outstanding invitation is
  a stale snapshot; letting it rewrite the role would allow an old STAFF link to demote a
  sitting admin, bypassing the last-admin guard below.
- **Re-inviting replaces the outstanding invitation in one transaction**, so two admins
  inviting the same person can't leave a second token that still works after the visible one
  is revoked.
- **The last admin cannot be removed or demoted.** `withLastAdminGuard` does the count and
  the write in one transaction behind `SELECT … FOR UPDATE` on the tenant's admin
  memberships. Counting outside the transaction was a race that could leave an organization
  with no admin and no way back in, since the team page itself requires one.
- Four acceptance states are handled: signed in as the invited address; signed in as someone
  else (offers sign-out rather than silently attaching to the wrong account); an existing
  confirmed account (sign in first); and a new colleague, who sets a password and is signed
  in — following a link sent to that inbox proves control of the address.
- **Accepting re-renders this page, by which point the token is spent.**
  `tenantJoinedWithToken` catches that: if the visitor is now a member of the tenant the
  token belonged to, the page confirms they've joined instead of calling the link dead. It
  is gated on membership, so a spent token still tells a stranger nothing.

## 8i. Theme and colour

The palette lives in `app/globals.css`: values in `@theme` for light, overridden under
`:root[data-theme="dark"]`. See §8 for the Tailwind v4 gotcha about `@theme inline`.

- **Never use Tailwind's `dark:` variant.** It compiles to `prefers-color-scheme`, which is
  the *operating system's* preference — and this app deliberately ignores that in favour of
  its own `data-theme` toggle. The two never meet, so a `dark:` utility renders its dark
  value on a light background and vice versa. This was live for a while and made every form
  error nearly unreadable. Use a token (`text-danger`, `text-muted`, …) instead; there are
  currently zero `dark:` utilities in `app/` or `components/` and it should stay that way.
- **Foreground tokens are picked by measurement, not by eye.** Every one clears WCAG AA
  (4.5:1) against `surface`, `panel` and `canvas` in both themes. If you change one, check it
  — several of the originals failed, including white-on-accent in dark mode at 3.22:1.
- The theme is applied pre-paint by a `next/script` with `strategy="beforeInteractive"` in
  the root layout. A plain `<script>` element works but makes React warn on every page.

## 8j. Privacy mechanics

- **Verification never writes during render.** `inspectVerification` reads;
  `redeemVerification` (called from an action) writes, claiming the token with a
  conditional update so simultaneous redemptions produce one activation. Anything that
  follows links in a mailbox would otherwise spend the token before the person saw it.
- **Retention.** [`lib/retention.ts`](../lib/retention.ts) removes spent and expired
  verification tokens and invitations after a week — both store an email address and were
  previously kept forever. There is no scheduler here, so it runs detached from the signup
  path and on demand via `pnpm db:prune`. Run the latter on a schedule in production. The
  full policy, including what is *not* automated, is in
  [DATA-RETENTION.md](DATA-RETENTION.md).
- **Erasure** clears the name, custom fields and check-in time, replaces the address with a
  non-reversible placeholder, and coarsens `createdAt` to the day. The exact second was
  enough to re-identify a row against a guest list exported before the erasure. Call it
  anonymisation, not destruction: earlier exports and delivered emails are outside our
  reach, which is why exports are logged.
- **Audit log** records exports, erasures, check-ins, event deletion and every team change.
  It stores identifiers only, and `onDelete: Restrict` stops it being cascaded away with the
  organization it holds accountable.
- **Attendee mail sets `reply_to`** to the organization's longest-standing admin. The
  message tells attendees to reply if they want their details changed or removed, and that
  is the only channel offered — without it the stated route did not exist.
- **Security headers** live in [`next.config.ts`](../next.config.ts). `Referrer-Policy` is
  load-bearing, not decoration: it keeps tokenised links out of the `Referer` header.

## 8k. Tests

```bash
pnpm test      # unit tests — no database needed
pnpm test:db   # capacity race — needs pnpm db:up first
```

**Why this setup and not Vitest.** Vitest and `tsx` both drive esbuild, which crashes in
this environment (§8, and the troubleshooting table). `tsc` and `node:test` are already
available and need no new dependency, so `pnpm test` compiles the pure modules with the
same compiler the project type-checks with and runs `node --test` against the output.
`tsconfig.test.json` lists what gets compiled.

The consequence: **only import-free modules are unit-testable this way** — `lib/time.ts`,
`lib/csv.ts`, `lib/slug.ts`. Anything importing Prisma or a path alias will not compile
under that config. That constraint is part of why `lib/slug.ts` exists as its own module.

What is covered, and why these:

- **`lib/time.ts`** — the most intricate logic here, and it fails silently: a wrong offset
  just puts the event at the wrong time for everyone. Covers the offset conversions,
  round-tripping across half- and quarter-hour zones, and the spring-forward gaps that were
  previously accepted and shifted.
- **`lib/csv.ts`** — a security control on attacker-controlled input. Covers each formula
  trigger, quoting, and the case needing both treatments in the right order.
- **`lib/slug.ts`** — the browser previews the address, the server decides it. Covers the
  shared behaviour both sides rely on, and the reserved names that would otherwise shadow a
  first-party route.
- **Capacity race** (`pnpm test:db`) — overselling is the worst outcome the product can
  produce, and the row lock is the kind of line a refactor removes as redundant. It runs
  **with and without the lock**: a "with lock" run alone can pass vacuously if the scenario
  never actually races, so the unlocked control has to oversell for the result to mean
  anything. Re-run this after touching that transaction.

Not covered: anything needing Prisma, React rendering, or a browser. Those have been
verified by hand and the evidence is in [AUDIT-FINDINGS.md](AUDIT-FINDINGS.md), but they are
not regression-protected.

## 9. Security & privacy (build-time requirements)

These are acceptance criteria, not optional. Full detail lives in the project plan; the
essentials:

- **Isolation:** server-derived tenant, `where: { id, tenantId }` everywhere, DB-checked
  `requireMembership` (§3).
- **Public surface:** rate-limit register/signup/login/resend and invitations; enforce event
  capacity inside a **transaction**, reading the limit through the row lock (no last-seat
  race). Rate limits key off `clientIp()`, which only trusts `X-Forwarded-For` as far as
  `TRUSTED_PROXY_COUNT` says there are proxies — the header is client-writable, so trusting
  it blindly lets a caller mint a fresh bucket per request.
  *Not yet done:* `customFields` is declared on the model but never written and has no size
  cap; the cap must exist before anything populates it (P4).
- **Signup:** reserved-slug blocklist (in [`lib/tenant.ts`](../lib/tenant.ts)) +
  email-verified tenant activation.
- **Erasure:** organizer delete anonymizes registrant PII (`anonymizedAt`) while keeping
  counts; log exports/deletes to `AuditLog`.
- **CSV export:** escape cells starting with `= + - @` (formula injection).

---

## 10. Milestone roadmap

- **M1 — done.** Scaffold + subdomain routing + credentials auth + DB-checked isolation.
- **M2 — done.** Self-serve signup with live slug availability, reserved-slug blocklist,
  hashed single-use verification tokens, email-gated tenant activation, rate limiting.
- **M3 — done.** Event CRUD and lifecycle, public event pages, registration with
  row-locked capacity enforcement, waitlists, dedupe, confirmation emails.
- **M4 — done.** Attendee list with search/filter/paging, check-in, CSV export with
  formula-injection escaping, registrant erasure, audit logging.
- **M5 — done.** Branded React Email templates for verification and registration, sent as
  HTML with a plain-text alternative; console transport retained for local development.
- **M6 — done.** Team members: invite by email with a role, accept (existing account or a
  new one), change roles, remove members, revoke invitations.

All six milestones are built. Four independent audits were then run over the codebase;
their findings and current remediation status live in
[AUDIT-FINDINGS.md](AUDIT-FINDINGS.md). P0–P2 are fixed; P3 (privacy) and P4
(maintainability) are outstanding, and several statements in this guide are marked below
where the code does not yet match the intent.

---

## 11. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `open //./pipe/dockerDesktopLinuxEngine ... cannot find the file` | Docker Desktop isn't running — start it, wait for "Engine running" |
| `The token '&&' is not a valid statement separator` | You're in PowerShell 5.1 — run commands separately |
| `EADDRINUSE :3000` | A dev server is already running on 3000 — stop it first |
| `tsx` crash / `TransformError` | Don't use `tsx`; run scripts with `node` (`.mjs`) |
| Migration/`P1012` about `url` unsupported | You're on Prisma 7 — this project pins Prisma 6 |
| `app.localhost` won't resolve | Use a Chromium/Firefox-based browser; `*.localhost` maps to 127.0.0.1 automatically |
