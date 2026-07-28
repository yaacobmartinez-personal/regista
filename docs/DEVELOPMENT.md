# Regista — Developer Guide

Architecture, conventions, and gotchas for working on Regista. For the product framing see
[business-explainer.html](business-explainer.html); for scope see [REQUIREMENTS.md](REQUIREMENTS.md).

---

## 1. Architecture at a glance

Regista is a **single full-stack Next.js app** (no separate API service). Business logic
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
  subdomains. Cookies are `HttpOnly` + `SameSite=Lax` + `Secure` (in production).
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
| `Registration` | Public sign-up; `anonymizedAt` supports true erasure |
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
| `RESEND_API_KEY` | Email provider key — leave blank in dev to log emails to console |
| `EMAIL_FROM` | Default From address for outbound email |

Secrets live only in `.env` (gitignored). Never log tokens or registrant PII, and never put
either in a URL query string.

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
- **`tsx` is broken in this environment** (esbuild `TransformError` / native crash). Do not
  run TypeScript scripts with `tsx`. The seed is plain Node ESM (`seed.mjs`, run with
  `node`). Prefer `.mjs` for one-off scripts.
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
  M5 swaps the transport for React Email templates.
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
- *Known gap:* a PENDING tenant holds its slug until manually cleaned up — reclaiming slugs
  from expired, unverified signups is deferred.

## 9. Security & privacy (build-time requirements)

These are acceptance criteria, not optional. Full detail lives in the project plan; the
essentials:

- **Isolation:** server-derived tenant, `where: { id, tenantId }` everywhere, DB-checked
  `requireMembership` (§3).
- **Public surface:** rate-limit register/signup/login; enforce event capacity inside a
  **transaction** (no last-seat race); size-cap `customFields`.
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
- **M3** — events CRUD + public registration (transactional capacity, waitlist).
- **M4** — attendee management (search, check-in, CSV export, erasure, audit log).
- **M5** — email (Resend + React Email; console fallback in dev).
- **M6** — team members (invite/accept/roles).

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
