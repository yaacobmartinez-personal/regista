# Changelog

All notable changes to Regista are recorded here, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Nothing has been publicly released yet. Entries are grouped by build milestone
(M1–M6) rather than semantic version; the first release will collapse these into
`0.1.0`.

## [Unreleased]

Next up: **M4 — attendee management** (searchable guest list, check-in, CSV
export, erasure, audit log).

## [M3] — Events and public registration — 2026-07-28

Organizers can publish events, and the public can sign up for them. This is the
first milestone where Regista does the job it exists for.

### Added

- Event management in the dashboard: create, edit, and delete events with a
  title, description, start and end times, optional capacity, and a waitlist
  toggle.
- Draft → Published → Closed lifecycle. Publishing opens the event's public
  registration page; closing stops sign-ups.
- Event list showing status, scheduled time, and confirmed registrations against
  capacity, with publish and close controls.
- Public event page at `<organization>.<domain>/<event>` with the registration
  form, remaining places, and a shareable link.
- Public listing of an organization's published events on its home page.
- Waitlist support: when an event is full and a waitlist is enabled, sign-ups
  join the waitlist and are told so plainly.
- Confirmation email on registration, worded differently for confirmed and
  waitlisted places.
- Event links are derived from the title and made unique within the
  organization, so two events can share a name without clashing.

### Security

- Capacity is enforced under a database row lock, so simultaneous sign-ups for
  the last place cannot oversell it. Verified with a concurrency test: 20
  simultaneous attempts on a 5-place event confirmed exactly 5, while the same
  test without the lock oversold to 17.
- One sign-up per email address per event, enforced by the database and reported
  as a friendly message rather than an error.
- Draft and closed events are not reachable publicly.
- Public registration is rate limited per address.
- Event forms cannot set the organization, status, or check-in fields; those are
  applied server-side only.
- Registrations, events, and counts are read and written scoped to the
  organization, never by id alone.

### Privacy

- The registration form states what is collected, why, and that the organizer can
  remove the details on request.

## [M2] — Self-serve tenant signup — 2026-07-28

Anyone can now create an organization from the marketing site. It stays offline
until the owner confirms their email.

### Added

- Signup form at `/signup` with live address availability, auto-derived from the
  organization name, and a disabled submit for taken or reserved addresses.
- Signup creates a `User`, a `PENDING` tenant, an `ADMIN` membership, and a
  verification token in a single transaction.
- Email verification route (`/verify`) on the dashboard subdomain; redeeming a
  link activates the tenant and marks the address verified.
- "Check your email" screen with a rate-limited resend.
- `lib/email.ts` — transport seam that prints to the server console in
  development and uses Resend when `RESEND_API_KEY` is set.
- `lib/rate-limit.ts` — in-process fixed-window limiter (signup 5/hour/IP,
  resend 3/15min/IP).
- `lib/tokens.ts` — verification token generation and hashing.

### Security

- Verification tokens are 256-bit random, stored only as a SHA-256 hash,
  single-use, and expire after 24 hours.
- Signing up with an address that already has an account never overwrites that
  account's password, and returns a response identical to a fresh signup, so the
  form cannot be used to discover who has an account.
- A tenant awaiting verification serves 404 on its public pages.
- Reserved addresses (`app`, `www`, `admin`, `login`, …) are rejected.
- The pending email address is carried to the confirmation screen in an httpOnly
  cookie rather than the URL.

### Fixed

- Moved the no-flash theme script into `<head>`, clearing a React warning about
  script tags rendered inside components.

## [Marketing site] — 2026-07-28

### Added

- Full landing page: hero with scroll-linked parallax, a word-by-word headline
  entrance, and an animated mock of a live registration page.
- "How it works" (three sequenced steps), features, trust, and closing CTA
  sections; sticky nav with a scroll progress bar.
- Motion primitives in `components/motion`, all honouring
  `prefers-reduced-motion`.

### Removed

- Eyebrow badge above the hero headline — it read as templated filler.

## [M1] — Multitenant foundation — 2026-07-28

### Added

- Next.js 16 App Router application with Postgres, Prisma 6, and Auth.js v5.
- Subdomain routing in `proxy.ts`: apex serves marketing, `app.` serves the
  organizer dashboard, and any other subdomain serves that tenant's public pages.
- Credentials sign-in with argon2 password hashing; organizer dashboard shell
  with an organization switcher and sign-out.
- Data model covering tenants, users, memberships, invitations, events,
  registrations, an audit log, and verification tokens, plus a seed script with
  two organizations for isolation testing.
- Design system: cool-neutral palette with a single cobalt accent, light-first
  with a persisted dark-mode toggle.
- Local Postgres via Docker Compose; `README.md` and `docs/DEVELOPMENT.md`.

### Security

- Every tenant-scoped query is filtered by tenant, and objects are fetched by
  `(id, tenantId)` rather than id alone.
- Membership and role are read from the database on every request, so removing a
  member or changing a role takes effect immediately.
- Non-members receive a 404 rather than a permission error, so dashboard URLs do
  not reveal which organizations exist.
- The session cookie is host-only, scoped to the dashboard subdomain, and never
  sent to tenant public pages.

### Fixed

- Sign-in now routes a single-organization user straight to their dashboard.
  Previously it redirected to a path shared with the marketing home, which could
  serve the landing page from the client router cache.

## Known gaps

Deliberately deferred; tracked here so they are not mistaken for oversights.

- A tenant awaiting verification holds its address indefinitely. Reclaiming
  addresses from expired, unverified signups is not implemented.
- Rate limiting is per-process and resets on restart. Running more than one
  instance needs a shared store (Redis) behind the same interface.
- Verification does not sign the user in; they sign in with the password they
  just chose.
- Registrants cannot manage their own registration, and waitlists do not promote
  automatically when a place frees up; an organizer must act.
- Event times are entered and displayed in the viewer's timezone with no explicit
  timezone control, so organizers and attendees in different regions see
  different local times for the same event.
- The registration form collects a name and email only. Per-event custom
  questions are not implemented.
- Email uses plain-text bodies. Templates and a verified sending domain arrive
  with M5.
- No payments, custom domains, social sign-in, or CAPTCHA.
