# Regista — roadmap & next phases

Where the product goes from here. This is a living plan, not a contract; phases
are ordered by value-for-effort and by what unblocks what. It complements
[REQUIREMENTS.md](REQUIREMENTS.md) (what v1 is) and the monetization thinking
that will land in `docs/MONETIZATION.md`.

---

## Where we are

Everything in v1 is built, audited, and documented: subdomain-multitenant
signup, email-verified activation, events with timezone-correct scheduling,
public registration with race-safe capacity and waitlists, attendee management
(search, check-in, CSV export, right-to-erasure), team members with roles, and
registrant self-service (view/cancel from an emailed link) with organizer-driven
waitlist promotion.

A competitor scan (a sports/club registration platform) confirmed two things:
our **core is strong** — we match or beat their free tier and lead on privacy,
waitlists, and correctness — and our **paid-tier surface is thin**, because the
features that justify charging (payments, custom forms, broadcast email, custom
domains) are deliberately deferred. The plan below turns that into an order of
work.

---

## Guiding principle

Ship the smallest thing that a real organizer would notice, in an order where
each phase stands on its own. Don't build the billing machinery before there's
something worth billing for; don't go online before the day-of experience is
complete enough to trust.

---

## Phase overview

| Phase | Theme | Why now | Rough size |
|---|---|---|---|
| **A** | Core platform + self-service | ✅ Done | — |
| **B** | **QR check-in** | ✅ Done | Small–medium |
| **C** | Go online | Real users need a real deployment | Medium (mostly ops) |
| **D** | Sellable Premium tier | The features that justify a paid plan | Large |
| **E** | Custom tier | Enterprise/branding asks | Medium–large |
| — | Cross-cutting hardening | Ongoing | — |

The immediate order the project owner set: **plan → build QR (Phase B) → go
online (Phase C)**. Phases D and E are sketched so decisions made now don't
paint them into a corner.

---

## Phase B ✅ — QR check-in

**Built.** Ships as specified below: a `checkInToken` on each registration, the
QR on the registrant's manage page and a pointer to it in the confirmation email,
an in-app camera scanner (with manual entry), and a native-camera URL landing —
both routes gated by staff membership and safe against prefetch. Covered by
`tests/checkin.integration.mjs`.

**Goal.** Turn the door into a queue that moves: a staff member points a phone
at each attendee's code and marks them present, with instant, unmistakable
feedback. Manual check-in (the existing toggle) stays as the fallback.

This is additive. Check-in already exists — `toggleCheckIn` in
[attendees/actions.ts](../app/app/o/[slug]/events/[eventSlug]/attendees/actions.ts)
sets `checkedInAt` and writes a `CHECK_IN_REGISTRATION` audit entry. QR just
gives it a fast input path.

### The two halves

1. **The attendee's code (their "ticket").** Each registration carries a QR that
   encodes a short, unguessable check-in token. It appears on the registrant's
   self-service page ([the `…/manage` page](../app/[domain]/[eventSlug]/manage))
   and in their confirmation email, so they can show it on a phone or on paper.

2. **The staff scanner.** A new dashboard page opens the device camera, decodes
   QRs live, and marks each one checked in — showing a big green "✓ Amara Okafor
   — checked in", an amber "already checked in at 09:412", or a red "not for this
   event / not recognized", then immediately readies the next scan.

### Data model

Add one field to `Registration`:

```prisma
/// Encoded in the attendee's QR ticket. Random, not a login credential — the
/// check-in action is still gated by a staff session and tenant scope — but
/// unguessable so a code can't be forged or enumerated. Cleared on erasure.
checkInToken String? @unique
```

- Generated when a registration is created (and on the re-registration reactivate
  path), alongside the existing `manageToken`.
- **Kept distinct from `manageToken`.** They are different capabilities for
  different people: `manageToken` lets the *registrant* cancel; `checkInToken`
  lets *staff* mark attendance. Reusing one for both would let a leaked ticket
  photo cancel a place, or a cancel link check someone in.
- Cleared on erasure, exactly like `manageToken`, so an erased person's ticket
  stops resolving.
- A one-off backfill script mints tokens for existing rows.

### Flow

- **Scanner page:** `app/app/o/[slug]/events/[eventSlug]/checkin` — a client
  component (camera is a browser API) guarded by `requireMembership` on the
  server wrapper. Decodes a QR, then calls a server action `scanCheckIn(token)`.
- **`scanCheckIn(token)`** (server action): resolves the token to a registration
  **within the staff member's tenant and this event**, sets `checkedInAt` if not
  already set, writes the existing `CHECK_IN_REGISTRATION` audit entry, and
  returns `{ name, status, alreadyCheckedInAt }` for the on-screen feedback.
  Rate-limited like the other public-facing writes.

### Edge cases (all surfaced on screen, none fatal)

| Situation | Result |
|---|---|
| Token not found / erased | "Not recognized" |
| Belongs to another event | "Wrong event — this ticket is for _X_" |
| Belongs to another tenant | Same as not found (no cross-tenant disclosure) |
| Already checked in | "Already checked in at _time_" (idempotent, not an error) |
| Registration cancelled | "This place was cancelled" (staff decides whether to admit) |
| Waitlisted, not confirmed | "On the waitlist — not a confirmed place" |

### The one new dependency

- **QR generation** (server): a small library to render the code as an SVG/data
  URL for the email and the manage page. Candidate: `qrcode` (pure JS, no native
  build).
- **QR decoding** (client): a camera-decode library. Candidates: `@zxing/browser`
  or `html5-qrcode`. This is runtime code bundled by Turbopack, so it avoids the
  build-tool issues that have bitten us with test runners; still, we pin one and
  keep it isolated to the scanner component.

Both are additive and confined to the check-in feature.

### Tests & verification

- An integration test in the style of `registration-lifecycle.integration.mjs`:
  token resolves within tenant/event; wrong-event and wrong-tenant rejected;
  already-checked-in is idempotent; cancelled/erased handled.
- Manual runtime check of the scanner against a rendered ticket (camera works on
  `localhost` and over HTTPS).

### Explicitly out of scope for Phase B

Offline scanning, badge printing, self-check-in kiosks, and multi-scanner
conflict handling beyond the idempotent "already checked in" case.

---

## Phase C — Go online

The product needs a real home. The dependencies, grounded in the code (the app
routes every request by `Host` in [proxy.ts](../proxy.ts) off
`NEXT_PUBLIC_ROOT_DOMAIN`):

**Hosting.** A container host with a persistent Node server (Fly.io / Railway /
Render) suits this codebase better than serverless: native `@node-rs/argon2` and
the Prisma engine "just work", the in-memory rate limiter actually works on one
long-running process, and row-lock transactions need no pooling gymnastics.
Managed Postgres (Neon / Supabase) + Resend for email.

### Wildcard DNS & TLS — the options

The whole product is subdomain-multitenant, so `*.rootdomain` must resolve and
be served over HTTPS. This is the part most likely to feel hard, so here are the
ways to make it easy, best first.

**Option A — Cloudflare in front (recommended).**
Put the domain on Cloudflare and proxy the app through it.
- **Wildcard DNS:** a single `*` record pointing at the origin host.
- **Wildcard TLS:** Cloudflare's free Universal SSL certificate already covers
  the apex **and first-level wildcards** (`*.regista.app`) — which is all Regista
  uses (`acme.`, `app.`). No cert wrangling on the origin; use a Cloudflare
  Origin Certificate for Full (strict) TLS to the backend.
- **Origin:** any host — Fly, Railway, Render, or a plain VPS.
- Net effect: the wildcard problem essentially disappears, for free.

**Option B — A platform that manages the wildcard for you.**
- **Vercel:** add `*.regista.app` as a domain (paid plan) and it issues the cert.
  Least infra, but drags in the serverless caveats we've noted (Prisma
  `binaryTargets`, pooled + direct DB URLs, and a shared store for rate limiting).
- **Fly.io:** `fly certs add "*.regista.app"` issues a wildcard cert via a DNS-01
  challenge (needs one DNS record). Works, slightly more hands-on than A.

**Option C — Sidestep wildcards entirely: path-based tenancy (fallback).**
Serve tenants at `regista.app/acme` instead of `acme.regista.app`. One domain,
one ordinary certificate, zero wildcard anything.
- **Cost:** it's an architecture change — [proxy.ts](../proxy.ts) and the URL
  helpers in [lib/urls.ts](../lib/urls.ts) are built around subdomains — and it
  gives up the "your own branded address" pitch that is part of the product's
  identity. Keep this in the back pocket only if A and B both prove impractical.

**Recommendation:** **Option A (Cloudflare + a container host).** It removes the
wildcard pain for free and keeps the subdomain product intact.

### The rest of the go-live checklist

Already enumerated when we discussed hosting; the short form:
- Env: `AUTH_SECRET`, `DATABASE_URL`, `NEXT_PUBLIC_ROOT_DOMAIN`, `RESEND_API_KEY`,
  `EMAIL_FROM`, `TRUSTED_PROXY_COUNT` (match the proxy depth — Cloudflare + host
  is typically 2).
- NextAuth `trustHost` on, cookies scoped for production.
- Verified sending domain in Resend (SPF/DKIM/DMARC records).
- `prisma migrate deploy` on release; `prisma generate` on build.
- Schedule `pnpm db:prune` (token/invite cleanup).
- Non-code, owner's: DPAs with Resend/host/DB; EU-vs-US data-residency choice.

The step-by-step runbook — free-tier stack included — is in
[DEPLOYMENT.md](DEPLOYMENT.md).

---

## Phase D — A sellable Premium tier (monetization build)

This is where the paid plan gets something to sell. Ordered by pricing power for
the least build; each also stands alone as a feature. Detail lands in
`docs/MONETIZATION.md`; the build targets:

1. **Custom questions per event.** The schema already has an unused
   `customFields` on `Registration` — turn it into a small per-event form builder
   (typed fields, validation, size caps). The single most-requested gap and the
   backbone of a paid tier.
2. **Broadcast email to registrants.** Compose-and-send to an event's guest list
   (we already send automatic confirmations; this adds organizer-initiated
   messages), with unsubscribe/consent handling.
3. **Access-restricted registration.** Private forms behind an access code.
4. **Payments (the big one).** Paid tickets via Stripe — then the cluster that
   hangs off it: custom pricing, discounts/promotions, taxes, receipts. Largest
   effort and the most compliance; sequence it last in this phase.
5. **Entitlements + billing.** A `lib/entitlements.ts` that gates the above by
   plan, mirroring how `lib/authz.ts` gates by role, plus Stripe Billing for the
   subscription itself. Meter on registrations/month, matching how comparable
   platforms price.

---

## Phase E — Custom tier

- **Custom domains** per tenant (bring-your-own domain + cert), and removing the
  "Powered by Regista" mark.
- **Multi-level organizations** (sub-orgs / hierarchy) for larger customers.

---

## Cross-cutting, ongoing

- **Security:** 2FA for organizers; tighten CSP with nonces (a known deviation in
  [AUDIT-FINDINGS.md](AUDIT-FINDINGS.md)).
- **Operational polish that isn't payments:** edit a registrant's details;
  printable attendee reports; bulk import of entries.
- **Testing:** keep growing the `node:test` + integration suite as features land.

---

## Deliberately not planned

Sports-league features from the competitor scan — results, divisions, match
scheduling, qualifying marks, membership validation — are a different product.
Matching them would be a repositioning, not a roadmap item.
