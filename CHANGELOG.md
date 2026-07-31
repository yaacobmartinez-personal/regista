# Changelog

All notable changes to Regista are recorded here, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Nothing has been publicly released yet. Entries are grouped by build milestone
(M1–M6) rather than semantic version; the first release will collapse these into
`0.1.0`.

## [Unreleased]

Team members (M6) are built and awaiting end-to-end verification. Next after
that: the remaining audit findings (P1–P4 in `docs/AUDIT-FINDINGS.md`).

### Security

Four independent audits were run over the codebase; the findings are recorded in
`docs/AUDIT-FINDINGS.md`. These are the ones fixed so far — everything a
deployment would have been unsafe without.

- **Registering someone else's email address no longer locks them out of
  Regista.** An address nobody has confirmed is now treated as unclaimed: it
  cannot be signed into, and the person who does confirm it takes ownership. It
  was previously possible to register a colleague's address, keep a working
  login for it, and leave them permanently unable to accept an invitation, with
  no way to recover.
- **An organization that hasn't confirmed its address can no longer be used.**
  It could previously run real events while still counting as an abandoned
  signup — whose address, and all its events and attendees, another signup would
  silently delete. Releasing an address now refuses outright if anything has been
  created under it.
- **Sign-in is rate limited**, per account and per source. It previously wasn't,
  despite the documentation saying otherwise.
- **Rate limits can no longer be bypassed** by forging a forwarding header. The
  number of proxies in front of the app is now configuration
  (`TRUSTED_PROXY_COUNT`), and the header is ignored entirely by default.
- **A missing email API key now fails loudly instead of writing every message to
  the log.** Verification and invitation links are bearer credentials; in
  production a missing key raises an error, and tokens are redacted from
  development output unless explicitly opted in.
- **Two admins acting at the same moment can no longer leave an organization
  with none.** The check and the change now happen together, so an organization
  can't be locked out of its own settings with no way back.
- **Deleting an event is recorded**, including how many registrations went with
  it. It cascades to every attendee record and was previously untraceable.
- **`home` and other first-party names are reserved.** `home` was claimable,
  which would have served the marketing site and signup form from what looked
  like a customer's own address.
- Invitations are rate limited per organization and per admin, and names are
  stripped of anything that could break out of an email header.

### Changed

- The organization chooser now shows an unconfirmed organization with the reason,
  instead of a link that leads nowhere.

## [M5] — Designed emails — 2026-07-29

Messages now look like they came from the product rather than a terminal.

### Added

- Branded HTML emails for confirming a new organization and for event
  registration, matching the product's look.
- **Registration emails now say when the event is.** They carry the date and time
  in the event's own timezone, taken from the same helper the event page uses, so
  the email and the page can never disagree.
- Waitlist confirmations read differently from a confirmed place, rather than
  both being "you're registered".
- Every message goes out as HTML with a plain-text alternative, so clients that
  refuse HTML still get something readable.
- Registration emails link back to the event page and name the organizer as the
  person to contact.
- `EMAIL_DEBUG_HTML` prints the rendered HTML alongside the text while working on
  templates locally.

### Fixed

- A confirmation email read "expires in 24hours" — the space was lost when the
  value was substituted into the sentence.

### Notes

- Sending in production still needs a verified domain in Resend with DKIM, SPF,
  and DMARC published. Until `RESEND_API_KEY` is set, nothing is sent and messages
  are written to the server console instead. See the developer guide.

## [Bug fixes] — 2026-07-29

A pass over the milestones so far, before adding more.

### Fixed

- **Event times now mean the same thing to everyone.** Each event carries its own
  timezone, chosen when the event is created and defaulting to the organizer's.
  Times are shown in that timezone with the zone alongside them, so an attendee
  abroad sees the hour the organizer scheduled instead of it shifted into their
  own local time.
- **Signing in with more than one organization reached the landing page instead
  of the organization chooser.** The chooser now has its own address, and sign-in
  sends the browser there properly. Signing in with a single organization still
  goes straight to it.
- **An unconfirmed signup held its address forever.** Once the confirmation
  window has passed with the address still unverified, it is treated as abandoned
  and someone else can claim it. Addresses still awaiting confirmation inside the
  window stay protected.
- Two people submitting the same new address at the same moment now get a clear
  message rather than an error page.

### Changed

- Event times entered before this release were interpreted in the server's
  timezone and are now recorded as UTC. Existing events default to UTC; check any
  that were already scheduled and set the intended timezone on them.

## [M4] — Attendee management — 2026-07-28

Organizers can now work with the people who signed up: find them, check them in
on the day, take the list away, and remove someone's details on request.

### Added

- Attendee list for each event, searchable by name or email and filterable by
  status, with paging for large events.
- Running totals of registrations against capacity and how many have checked in.
- One-click check-in, and an undo for when it was the wrong person.
- CSV export of an event's attendees.
- Erasure: an organizer can remove a registrant's personal details on request.
  The attendance record is kept so counts stay accurate, but the name and email
  are gone and the row reads "Details erased".

### Security

- Spreadsheet formula injection is neutralised on export. A registrant who signs
  up as `=cmd|'/c calc'!A1` exports as inert text rather than a live formula.
- Exports and erasures are recorded in the audit log with who did it and when.
- Exports are sent with no-store so personal data is not cached.
- Attendee pages and exports are scoped to the organization: requesting another
  organization's attendee list or export returns 404, verified in testing.
- Erasure replaces the email with a non-reversible placeholder, so the original
  address is not recoverable from the row.

### Changed

- Removed the placeholder "Attendees" item from the dashboard navigation.
  Attendees belong to an event, so they are reached from the event itself.

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

- Abandoned addresses are only released when someone else tries to claim one.
  There is no background job reaping unverified signups, so the rows linger.
- Rate limiting is per-process and resets on restart. Running more than one
  instance needs a shared store (Redis) behind the same interface.
- Verification does not sign the user in; they sign in with the password they
  just chose.
- Registrants cannot manage their own registration, and waitlists do not promote
  automatically when a place frees up; an organizer must act.
- The registration form collects a name and email only. Per-event custom
  questions are not implemented.
- Event times are shown in the event's timezone only. Attendees are not offered
  a "in your local time" conversion alongside it.
- Email uses plain-text bodies. Templates and a verified sending domain arrive
  with M5.
- No payments, custom domains, social sign-in, or CAPTCHA.
