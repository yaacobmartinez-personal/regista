# Deploying Thingstead on free tiers

Getting Thingstead online without a hosting bill, one service at a time. This is the
runbook for Phase C in the [roadmap](ROADMAP.md).

> **Free-tier limits drift.** The allowances below were accurate at time of
> writing; confirm the current numbers when you sign up. The *shape* of the plan
> (what each service does for us) is what matters here.

---

## What Thingstead needs from a host

Grounded in the code, so we pick services that can actually run it:

- **Two hostnames, no wildcard.** Tenants live on a **path** (`yourdomain/acme`),
  and the dashboard on one fixed `app.yourdomain` — see [proxy.ts](../proxy.ts).
  So all you need in DNS is the apex and one `app.` record, each with an ordinary
  certificate. **No wildcard DNS or TLS**, which is what makes this deployable on
  any host. (Keeping the dashboard on its own subdomain is deliberate: the session
  cookie is host-only for `app.`, so it is never sent to a tenant's public pages.)
- **A Node runtime** — not edge: it uses Prisma and the native `@node-rs/argon2`.
- **A persistent server is preferable** — the rate limiter is in-memory, so one
  long-running process is better than many serverless instances.
- **Postgres** — the capacity lock needs real transactions (any Postgres has them).
- **Email** — Resend, which needs a verified sending domain.

---

## The free-tier stack

| Piece | Service | Free tier (verify at signup) | Caveat |
|---|---|---|---|
| Domain | Cloudflare Registrar (or any) | ~$10/yr — **not free** | Required for the app address and email |
| DNS + TLS | The app host, or **Cloudflare** | Free | Just the apex + one `app.` record, ordinary certs — **no wildcard** |
| Database | **Neon** | Free: ~0.5 GB, autosuspends when idle | Brief cold start on wake; use the pooled URL for the app, the direct URL for migrations |
| App host | **Fly.io** (rec.) or **Render** | Small always-on machine / free web service | Render free **sleeps after 15 min idle** (~30 s cold start); Fly runs a tiny machine |
| Email | **Resend** | ~3,000/mo, 100/day | Needs a verified domain (DNS records) |

**Net cost: ~$10/yr for the domain.** Everything else is free at low volume.

### Why this shape
Path-based tenancy means there is no wildcard to solve: the app answers on the
apex and one `app.` subdomain, both of which any host (or Cloudflare) can issue an
ordinary certificate for. A container host (Fly/Render) runs the app the same way
it runs locally — one Node process — which keeps native modules and the in-memory
rate limiter working without serverless workarounds. Cloudflare in front is still
a nice-to-have (caching, DDoS protection), but no longer required to solve DNS.

---

## Order of operations (one by one)

Each step is self-contained; do them in order because later steps reference
earlier ones. Steps marked **(you)** need your own accounts — I can't create
accounts or enter credentials. Steps marked **(me)** are code/config I prepare.

1. **Domain (you).** Buy one (Cloudflare Registrar sells at cost). This unlocks
   both subdomains and email.
2. **DNS (you).** Two records only — the **apex** and one **`app.`** — both
   pointing at the app host once it exists. No wildcard. This can be your host's
   own DNS or Cloudflare; either issues ordinary certs for the two names.
3. **Database — Neon (you).** Create a project; copy the **pooled** and **direct**
   connection strings.
4. **App prep (me).** Standalone build output, a Dockerfile, NextAuth `trustHost`,
   `TRUSTED_PROXY_COUNT`, Prisma `directUrl`, and migrate-on-deploy. (Details below.)
5. **App host (you + me).** Deploy to Fly/Render, set the env vars, run
   `prisma migrate deploy`. I prepare the config; you run the deploy from your
   account.
6. **Email — Resend (you).** Verify the domain (add the DNS records it gives you
   in Cloudflare), copy the API key.
7. **Wire it up (you + me).** Point the apex and `app.` records at the app host,
   set `NEXT_PUBLIC_ROOT_DOMAIN` to the real domain, and smoke-test:
   signup → verify email → create/publish an event → register → check-in.

---

## Code prep needed (Phase 4 above)

I'll make these once we pick the host — most are host-agnostic:

- **`next.config.ts`:** `output: "standalone"` for a lean container image.
- **NextAuth:** enable `trustHost` (it's behind a proxy on a custom host), and
  confirm cookie scoping for the real domain.
- **`TRUSTED_PROXY_COUNT`:** set to the proxy depth so rate-limiting reads the true
  client IP and can't be spoofed. One host proxy is `1`; add Cloudflare in front
  and it's `2`.
- **Prisma:** add `directUrl` to the datasource (Neon pooling: app uses the pooled
  URL, migrations use the direct URL).
- **Dockerfile** (container hosts) that builds, runs `prisma generate`, and starts
  the standalone server; run `prisma migrate deploy` on release.
- **Schedule `pnpm db:prune`** (token/invite cleanup) on the host's cron.

---

## Production environment variables

| Var | Value |
|---|---|
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `DATABASE_URL` | Neon **pooled** connection string |
| `DIRECT_URL` | Neon **direct** connection string (migrations) |
| `NEXT_PUBLIC_ROOT_DOMAIN` | e.g. `thingstead.pro` |
| `RESEND_API_KEY` | from Resend |
| `EMAIL_FROM` | e.g. `Thingstead <no-reply@thingstead.pro>` |
| `TRUSTED_PROXY_COUNT` | `2` (Cloudflare + host), confirm per host |

---

## Host notes

- **Fly.io (recommended).** Container-native (`fly launch` reads a Dockerfile), a
  small machine stays warm within the free allowance, and native modules just
  work. Add the apex and `app.` as custom domains; Fly issues certs for both.
- **Render.** A genuinely free web service, but it **sleeps after 15 minutes**
  idle, so the first visitor after a quiet spell waits ~30 s, and the in-memory
  rate-limit counters reset on wake. Fine for early days; revisit when there's
  steady traffic. No CLI needed — deploys from a Git repo.
- **Vercel.** More viable now that there's no wildcard to host, but its serverless
  model still drags in extra work for this app (Prisma `binaryTargets`, pooled +
  direct DB URLs, a shared store for rate limiting) — and the free Hobby tier is
  non-commercial. Workable, not the simplest free path.

---

## Not code — yours to arrange before real users

Carried over from the retention and requirements docs: data-processing agreements
with Resend / the host / Neon, and the EU-vs-US data-residency choice. Free to set
up, but they're decisions, not deployments.
