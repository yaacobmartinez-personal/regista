# Regista

Multitenant event registration platform. Each organization ("tenant") gets its own
subdomain, publishes events, and collects free registrations from the public. Organizers
manage attendees and invite teammates; registrants get email confirmations.

> **New here?** Read the plain-language [product overview](docs/business-explainer.html),
> the [requirements](docs/REQUIREMENTS.md), and the [developer guide](docs/DEVELOPMENT.md).
> Recent changes and known gaps live in the [changelog](CHANGELOG.md).

## Tech stack

- **Next.js 16** (App Router) — full-stack, Route Handlers + Server Actions
- **Postgres** + **Prisma 6** (ORM)
- **Auth.js / NextAuth v5** — credentials auth, argon2 password hashing
- **Tailwind CSS 4**, TypeScript
- **Resend** + React Email for transactional mail

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker Desktop (for local Postgres) — **must be started manually** before the DB commands

## Getting started

Run each command on its own (Windows PowerShell 5.1 does not support `&&` chaining):

```bash
pnpm install
```

Copy the env template and adjust if needed:

```bash
copy .env.example .env
```

Start Postgres (Docker Desktop must already be running):

```bash
docker compose up -d
```

Apply migrations and seed demo data:

```bash
pnpm db:migrate
```

```bash
pnpm db:seed
```

Start the dev server:

```bash
pnpm dev
```

## Local URLs

The dev server serves the apex and all subdomains on port 3000. `*.localhost` resolves to
`127.0.0.1` automatically in modern browsers.

| URL | Surface |
| --- | --- |
| `http://localhost:3000` | Marketing / landing |
| `http://app.localhost:3000/login` | Organizer dashboard (sign in) |
| `http://acme.localhost:3000` | A tenant's public pages |

## Seed accounts

Password for all seeded organizers: `password123`

| Email | Organization | Role |
| --- | --- | --- |
| `admin@acme.test` | acme | ADMIN |
| `admin@beta.test` | beta | ADMIN |

## Scripts

| Script | Description |
| --- | --- |
| `pnpm dev` | Start the dev server (apex + subdomains, port 3000) |
| `pnpm build` | Production build |
| `pnpm db:up` | Start the Postgres container |
| `pnpm db:migrate` | Create/apply migrations (`prisma migrate dev`) |
| `pnpm db:seed` | Seed demo tenants + accounts |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm db:reset` | Drop, re-migrate, and re-seed the database |
| `pnpm db:generate` | Regenerate the Prisma client |
| `pnpm db:prune` | Remove expired tokens and invitations (run on a schedule in production) |
| `pnpm test` | Unit tests — no database needed |
| `pnpm test:db` | Capacity race test — needs the database running |

## Project structure

```
app/
  home/          Marketing (apex)            -> app/home
  app/           Organizer dashboard          -> app.<root>
    login/       Sign in
    o/[slug]/    Tenant-scoped dashboard
  [domain]/      Tenant public pages          -> <tenant>.<root>
  api/auth/      NextAuth route handler
    o/[slug]/    Tenant-scoped dashboard (events, attendees, team)
    invite/      Accept a team invitation
    verify/      Confirm a new organization's email
lib/             db, auth, authz, tenant, events, time, tokens,
                 invitations, email, rate-limit, csv, audit
emails/          React Email templates
components/      Shared UI (brand, header, nav, theme toggle)
prisma/          schema.prisma, migrations, seed.mjs
proxy.ts         Subdomain routing (Next 16 "proxy" convention)
docs/            Requirements, dev guide, product overview
```

## Status

**All six milestones built** — subdomain routing and tenant isolation, email-verified
signup, events and public registration, attendee management, designed emails, and team
members.

Four independent audits were then run over the codebase — security, correctness, privacy
and code quality — and every finding has been addressed. What each one was and how it was
verified is in [docs/AUDIT-FINDINGS.md](docs/AUDIT-FINDINGS.md).

Still needed before this could serve real people: a verified sending domain (nothing is
delivered without it — see the [developer guide](docs/DEVELOPMENT.md)), data processing
agreements with the email and hosting providers, and the deployment decisions listed in
[docs/DATA-RETENTION.md](docs/DATA-RETENTION.md).
