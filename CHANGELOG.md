# Changelog

All notable changes to Regista are recorded here, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Nothing has been publicly released yet. Entries are grouped by build milestone
(M1–M6) rather than semantic version; the first release will collapse these into
`0.1.0`.

## [Unreleased]

All six milestones are built and walked through, and every audit finding is
addressed. Work has moved on to the gaps that were deliberately left out of v1.
Before a real launch: a verified sending domain, data processing agreements, and
the deployment decisions listed in `docs/DATA-RETENTION.md`.

### Added

- **Attendees can now give up their place themselves.** Every confirmation email
  carries a private link to the person's own registration, where they can see
  what they signed up for and cancel if they can't come. No account, no password
  — the link is the key, so it is stored only as a hash and the email says
  plainly that anyone holding it can cancel on their behalf.

  Cancelling frees the place and keeps the record. It is not erasure: the
  organization still needs to know the place came free and who released it.
  Having details removed entirely remains a separate, deliberate request.

  Opening the link changes nothing — cancelling takes a click and then a
  confirmation. A mail client that follows links to build previews would
  otherwise give away someone's place before they had read the message.

- **Organizers can promote someone off the waitlist.** A freed place is *not*
  filled automatically. Who gets it is a judgement — the person who waited
  longest is not always the one you'd pick — so the queue moves when an organizer
  presses **Promote**, which is refused if the event is already at capacity.
  (Raising an event's capacity still promotes automatically: that is the
  organizer saying "let more people in".)

- Someone who cancelled can sign up again. Previously the record left behind
  would have told them they were already registered while they held no place at
  all. They rejoin any waitlist at the back, since they left the queue.

- **An integration test for the whole lifecycle** — cancel, promote, rejoin —
  asserting among other things that cancelling moves *nobody* up. If a later
  change makes promotion automatic, that test fails rather than quietly changing
  who gets into events. Run with `pnpm test:db`.

- **A test suite.** There wasn't one. It covers the things that fail silently or
  matter most: timezone conversion including the hour that doesn't exist when
  clocks go forward, the spreadsheet-formula escaping on exported guest lists,
  and address generation. Run with `pnpm test`.
- **The capacity check is now a committed test rather than something we ran
  once.** It fires twenty simultaneous sign-ups at a five-place event, and also
  runs the same scenario with the protection removed to prove the test would
  actually catch a regression: five places held versus seventeen oversold.

### Fixed

- **Keyboard focus is now visible everywhere.** Around forty buttons and links
  had no focus indicator at all, because the app turns off the browser default
  and those had never been given a replacement.
- Publishing, editing or closing an event now refreshes its public pages.
  Closing registrations could previously leave a working sign-up form up.

### Changed

- The address shown while typing an organization name and the address actually
  assigned now come from the same code. They were separate copies that could
  drift, which would have meant the preview promising a link nobody got.
- Link and time-limit wording is derived from the settings rather than typed out,
  so changing "24 hours" in one place no longer leaves three pages saying the old
  number.
- Removed unused code, including a security helper that looked like it was
  protecting something but had no callers.

### Privacy

- **A confirmation link is no longer used up by something other than a person.**
  Mail clients and security scanners follow links in messages; opening the link
  used to activate the organization outright, so an organization could be
  activated — and the link spent — before the recipient ever clicked. Activating
  is now a deliberate step, and the link is taken out of the address bar once
  used.
- **"Reply to the organizer" now actually reaches them.** The confirmation email
  told attendees to reply if they needed their details corrected or removed, but
  replies went to an unattended address. Since that is the only route offered,
  the stated way to exercise those rights did not work.
- **Every event page now has a privacy notice** naming the organization as the
  one responsible for attendees' details, what is collected and why, that the
  email provider sees the name and address, how long things are kept, and what
  can be asked for. The registration form links to it.
- **A written retention policy exists** (`docs/DATA-RETENTION.md`), and the
  records that quietly kept email addresses forever — spent confirmation links
  and accepted invitations — are now removed a week after they stop being useful.
- **Erasure is harder to undo.** Clearing someone's details used to leave an
  exact sign-up time, enough to match the row back to them using a guest list
  exported earlier. The time is now kept only to the day, and check-in is
  cleared.
- **Checking someone in is recorded**, like exports and erasures. It asserts that
  a named person was somewhere at a time, and it was the one such action going
  unlogged.
- **The record of who accessed personal data outlives the organization.** It used
  to be deleted along with it, which defeated the point.
- Searching the guest list no longer puts the name or email you typed into the
  address bar, browser history, or server logs.
- Standard protective headers are set, including one that stops confirmation
  links leaking to other sites through the referrer.

## [M6] — Team members — 2026-07-29

Organizations can bring colleagues in.

### Added

- Team page for admins: invite by email with a role, see who's a member and
  what they can do, change roles, remove people, and revoke invitations that
  haven't been taken up.
- Invitation emails naming who invited you, which organization, and what the
  role lets you do.
- Four ways of accepting are handled: already signed in as the invited address;
  signed in as somebody else; an existing account that needs to sign in first;
  and a new colleague, who picks a password and is signed straight in.
- Staff don't see the Team tab at all, rather than a page that refuses them.

### Security

- **An invitation belongs to an address, not to whoever opens the link.**
  Someone forwarded the link, or signed in as another person, cannot accept it —
  they're told it was sent elsewhere and offered a sign-out, without being shown
  whose address it was.
- Invitation links work once and expire after a week; the link is stored only as
  a hash, so a copy of the database can't be used to join anything.
- Two people redeeming the same invitation at the same moment produces one
  membership, not two.
- **Accepting an invitation never changes a role you already have**, so an old
  link can't quietly demote an admin.
- An organization can't be left with nobody able to manage it: the last admin
  can't be removed or made staff, and the check happens in the same step as the
  change so two admins acting at once can't slip past it.
- Invitations, revocations, removals and role changes are all recorded.

### Fixed

- After joining, the invitation page said the invitation was no longer valid —
  true, because it had just been used, but a confusing first impression. It now
  confirms you've joined and links you into the organization. Someone else
  opening a spent link still learns nothing.

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

### Fixed

- **An event time that doesn't exist is now refused instead of silently moved.**
  On the morning clocks go forward an hour never happens, and scheduling into
  that gap shifted the event — an hour *earlier* than typed in the Americas, and
  to the previous day in Santiago. Times that occur twice (the autumn overlap)
  are still accepted, since those do exist.
- **Waiting lists move.** Raising an event's capacity, or removing the limit,
  now promotes the people who have been waiting longest. Previously they stayed
  queued indefinitely while later arrivals were confirmed ahead of them.
- **Capacity can no longer be set below the number of people already holding a
  place**, which left the public page reading "Full" while the dashboard showed
  more registered than the limit.
- **A rush of sign-ups no longer produces an error page.** Registrations for one
  event are processed in turn to protect the last place, and a crowd could
  exceed the waiting window; that now asks people to try again in a moment.
- **A failed confirmation email no longer discards a successful registration.**
  Registrants were shown an error and then told, on retry, that they were
  already signed up. Signup has the same protection, and reaches the screen
  where the email can be resent rather than stranding the address for a day.
- **Accepting an invitation can no longer lower someone's existing role.** An
  outstanding invitation is a snapshot; opening an old one could quietly demote
  a sitting admin, bypassing the last-admin protection.
- Re-inviting someone replaces the outstanding invitation atomically, so two
  admins inviting at once can't leave a second link that still works after the
  visible one is revoked.
- The event capacity used to decide confirmed-versus-waitlisted is now read
  under the same lock as the count, so a capacity change landing mid-sign-up
  can't oversell.
- An out-of-range or fractional page number in the attendee list no longer
  errors or strands the reader on an empty page.

### Accessibility

- **Error messages were unreadable for anyone whose computer is set to dark
  mode.** They were coloured by the system preference rather than by the app's
  own theme — which deliberately ignores that preference — so the pale text
  intended for a dark background was being shown on white, at roughly half the
  contrast needed to read it. Every form in the product was affected. Errors now
  follow the app's theme.
- Buttons in dark mode were white text on a light blue that didn't meet the
  contrast standard; they now use dark text on that blue.
- The dimmest text colour, and the green used for confirmations in light mode,
  both fell below the standard on the surfaces they appear on. Both darkened.
- **Being refused access no longer shows a bare browser error page.** Denial is
  deliberately indistinguishable from "not found", so that screen carries real
  weight; it now has the product's own design and a way back. Unexpected errors
  in the dashboard get the same treatment.
- Row actions in the attendee list now name the person they act on, so someone
  using a screen reader isn't offered fifty identical "Erase" buttons for an
  irreversible deletion. Confirming moves focus onto the confirm button rather
  than dropping it to the top of the page.
- The dashboard tabs now show which section you're actually in — "Events" was
  marked as current even while you were on Team — and announce it to assistive
  technology.

### Changed

- The organization chooser now shows an unconfirmed organization with the reason,
  instead of a link that leads nowhere.
- The attendee status filter no longer offers "Cancelled", which nothing ever
  set and so never matched anything.
- Registration and invitation timestamps are shown in a stated timezone instead
  of whichever one the server happened to be running in, unlabelled.

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
