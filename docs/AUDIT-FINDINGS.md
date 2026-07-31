# Audit findings — remediation list

Consolidated from four independent read-only audits (security, correctness,
privacy, code quality) of the working tree at M6, 2026-07-29. Duplicates merged;
one finding disproved and dropped (see the end).

Ordered by what would hurt most in production.

**Status: P0 (1–9) fixed and verified at runtime. P1–P4 outstanding.**

Verification evidence for the P0 batch:

- Squatted address: sign-in refused with the *correct* password while
  unconfirmed; the real owner then reclaimed the address, confirmed it, and
  signed in.
- Address release: a pending organization holding an event reads "already taken";
  one holding nothing is still claimable.
- Reserved names: `home` and `app` both refused.
- Sign-in rate limit fires and reports plainly.
- Email transport prints `token=[redacted]`; the usable link appears only behind
  the explicit dev opt-in.
- A member of an unconfirmed organization is shown the reason in the chooser, and
  the dashboard itself 404s.

---

## P0 — Fix before any deployment — ✅ DONE

### 1. Anyone can permanently lock a person out of Regista
`lib/auth.ts:33`, `app/home/signup/actions.tsx:136`

Signup writes a `passwordHash` before the address is verified, and `authorize`
gates only on that hash — `emailVerified` is written but **never read**. There is
no password-reset flow anywhere.

Attacker signs up as `victim@company.com` with their own password. A `User` row
now exists permanently with credentials the victim doesn't control. When the
victim is later invited to a real organization, `invitedUserHasAccount()` returns
true and the invite page tells them "You already have an account — sign in", which
they cannot do and cannot recover from.

**Fix:** refuse sign-in when `emailVerified === null`, or don't set `passwordHash`
until verification. Add a password-reset flow. Treat an unverified user with no
memberships as reclaimable.

### 2. An unverified organization can be used normally — then silently destroyed
`lib/authz.ts:35`, `lib/tenant.ts:56-80`

`requireMembership` never checks `tenant.status`, so a PENDING tenant's owner has
full dashboard access. Meanwhile any PENDING tenant older than 24h is "abandoned"
and `releaseAbandonedTenant` cascades a delete to `Membership`, `Event`,
`Registration`, and `AuditLog`.

Alice signs up for `acme`, never verifies, signs in anyway, runs real events for a
day. Bob signs up for `acme` → **Alice's events, attendees, and audit trail are
destroyed** to give Bob the subdomain.

**Fix:** require `status === "ACTIVE"` for dashboard mutations, and refuse to
release any tenant that owns events, registrations, or audit rows.

### 3. Login has no rate limiting
`app/app/login/actions.ts:24`

Signup (5/hr) and registration (20/hr) are limited; login is not, despite
`docs/DEVELOPMENT.md` listing it as an acceptance criterion. Unlimited credential
stuffing against `min(8)` passwords. Because argon2 is deliberately expensive,
it doubles as a cheap CPU-exhaustion attack. The NextAuth route is also directly
POST-able, bypassing the action entirely.

**Fix:** rate-limit by IP *and* by email, ideally inside `authorize` so the raw
route handler is covered too.

### 4. Every rate limit is bypassable
`lib/rate-limit.ts:57`

`clientIp()` trusts the first `X-Forwarded-For` entry with no trusted-proxy depth.
A fresh spoofed value per request gives a fresh bucket, nullifying signup, resend,
and registration limits at once. Conversely, behind two proxies everyone shares
one attacker-chosen bucket.

**Fix:** take the Nth-from-last entry per configured proxy depth; fail closed to a
global per-route bucket when the header shape is unexpected.

### 5. Missing API key turns every email into a log line
`lib/email.ts:24` — *found independently by both the security and privacy auditors*

The console transport triggers on `if (!apiKey)`, with no environment check. In
production with an unset, rotated, or typo'd `RESEND_API_KEY`, every message is
written to stdout — recipient address, attendee name, and the **raw single-use
verification and invitation tokens**. Silently, with no throw.

Log-aggregator read access becomes tenant-activation and team-join capability, and
it is replayable — defeating the point of storing only hashes.

**Fix:** gate on `NODE_ENV !== "production"`; in production a missing key must
throw. Redact the token even in dev. Same guard for `EMAIL_DEBUG_HTML`.

### 6. Two admins acting at once can leave an organization with zero admins
`app/app/o/[slug]/team/actions.tsx:33,149,186`

`adminCount()` runs outside any transaction or lock, then the write follows. With
exactly two admins, a simultaneous "make staff" and "leave" both read `2`, both
pass the `<= 1` guard, both writes land. `requireMembership(slug, "ADMIN")` then
404s for everyone: `/team` is permanently unreachable and nobody can be promoted.
**There is no recovery path in the application.**

**Fix:** do the guard and the write in one transaction with
`SELECT … WHERE tenantId = $1 AND role = 'ADMIN' FOR UPDATE`, or add a DB
constraint asserting at least one admin per tenant.

### 7. Deleting an event destroys every attendee record, unlogged
`app/app/o/[slug]/events/actions.ts:135`

The cascade hard-deletes all registrations. `recordAudit` is never called. This is
the largest PII-destruction path in the product and it is untraceable — while the
docs promise deletions are logged. It also bypasses the erasure design entirely.

**Fix:** add `DELETE_EVENT` to `AuditAction` and record it with the registration
count before deleting. Consider soft-delete for events that have registrations.

### 8. `home` is not a reserved subdomain
`lib/tenant.ts:4-19` vs `proxy.ts:35`

Route groups are `home`, `app`, `[domain]`, `api`. The blocklist covers `app`,
`api`, `www` — not `home`. Register the slug `home` and `home.<root>` serves the
**marketing site and signup form** on what looks like a customer subdomain, while
that tenant's own pages become permanently unreachable.

**Fix:** add `home`; better, derive the blocklist from the route-group names.

### 9. Unverified tenants can send unlimited branded email with chosen copy
`app/app/o/[slug]/team/actions.tsx:37`, `app/home/signup/actions.tsx:66`

`inviteMember` has no rate limit, and the organization name (60 chars, arbitrary
charset, newlines allowed) flows straight into the mail subject. Combined with #1
and #2: sign up, log in unverified, send unbounded invitation emails to arbitrary
addresses from your verified sending domain with attacker-authored subject lines.

**Fix:** rate-limit `inviteMember` per tenant and per actor; restrict organization
and inviter names to printable single-line characters before they reach a header.

---

## P1 — Correctness bugs users will hit

### 10. Times that don't exist shift silently — backwards in western zones
`lib/time.ts:50`

Round-trips are perfect (verified over 16 zones × 365 days × 8 times, zero
failures). Spring-forward gaps are not validated: a New York event at
`2026-03-08T02:30` is stored and emailed as **01:30, an hour earlier than typed**.
Santiago rolls to the previous calendar day. No error is surfaced.

**Fix:** if `utcToZonedInput(result, tz) !== input`, the time didn't exist — return
a Zod issue on `startsAt` naming the problem.

### 11. Capacity is read before the lock
`app/[domain]/[eventSlug]/actions.tsx:66-87`

The lock is correctly taken before the count, and the last-seat case is properly
serialized. But `capacity` and `waitlistEnabled` come from the *unlocked* read, so
the decision mixes a possibly-stale limit with a fresh count. A concurrent
capacity reduction can still oversell.

**Fix:** read those columns through the locking statement.

### 12. Lock contention surfaces as a 500
`app/[domain]/[eventSlug]/actions.tsx:107`

Only `P2002` is handled. `FOR UPDATE` deliberately serializes registrations, so a
burst on a popular event exceeds Prisma's transaction window and users get an
unhandled 500 rather than "we're busy, try again". `RegisterState.error` exists and
is rendered — it's simply never populated for this case.

**Fix:** catch `P2028`/`P2034` and return a friendly error; raise the timeout.

### 13. Email failure after commit strands the user
`app/home/signup/actions.tsx:174`, `app/[domain]/[eventSlug]/actions.tsx:137`

`sendEmail` throws on any non-2xx and no caller catches it.

- **Signup:** the tenant is already committed and the pending-email cookie is set
  *after* the send — so the user gets a 500, their slug now reads "taken" for 24
  hours, and they can't reach the resend screen.
- **Registration:** the row is committed, then the send throws. On retry they're
  told "you're already signed up" — registered, but informed of the opposite.

**Fix:** catch around both sends, return a soft state, and set the signup cookie
before sending.

### 14. A stale invitation can demote a sitting admin
`lib/invitations.ts:61`

The upsert's `update: { role }` rewrites an existing membership's role, and
`Invitation` has no unique constraint on `(tenantId, email)` while the
delete-then-create in `inviteMember` isn't transactional — so two concurrent
invites can leave two live tokens. Accept the ADMIN one, then open the STAFF one:
demoted, with the last-admin guard never consulted.

**Fix:** `update: {}` (accepting must never lower a role), add
`@@unique([tenantId, email])`, wrap delete-then-create in a transaction.

### 15. Waitlists are a dead end
`prisma/schema.prisma:33`, `app/[domain]/[eventSlug]/actions.tsx:98`

Nothing ever writes `CANCELLED`, and nothing promotes `WAITLIST` → `CONFIRMED`.
Raising capacity or removing the limit leaves existing waitlisters queued forever
while new arrivals are confirmed ahead of them. Capacity can be set below the
confirmed count, after which the public page reads "Full" and the dashboard reads
"50 registered of 5". The attendees page offers a "Cancelled" filter that can
never match.

**Fix:** reject capacity below confirmed count; promote on capacity increase; drop
the filter option if cancellation stays out of scope.

### 16. Concurrent claim of an abandoned slug 500s
`app/home/signup/actions.tsx:129`

`releaseAbandonedTenant` sits outside the P2002 try/catch and `tenant.delete`
throws `P2025` when the row is already gone. Its two statements also aren't in a
transaction, so a crash between them destroys the old tenant without granting the
slug.

**Fix:** `deleteMany` + treat `count === 0` as "someone else took it"; wrap release
and create together.

### 17. `?page=1.2` returns a 500
`.../attendees/page.tsx:50`

`Number(page)` accepts fractions → non-integer `skip` → Prisma throws. `page` is
also never clamped to `pageCount`, so `?page=999` strands the user on an empty
list with no controls.

**Fix:** `Math.floor`, then clamp.

---

## P2 — Accessibility and UI quality

### 18. Every `dark:` utility is wired to the OS, not to the app's theme
19 usages across 8 files — *verified directly*

No `@custom-variant dark` is declared, so Tailwind's `dark:` still means
`prefers-color-scheme`. The app's theme is a `data-theme` attribute that
deliberately ignores OS preference. The two never meet.

Because the app defaults to light regardless of OS, **any user with a dark OS sees
`text-red-400` on white — 2.77:1 — on every form error in the product.**

**Fix:** add `--color-danger` tokens and replace all 19 `text-red-600
dark:text-red-400` with `text-danger`, removing the `dark:` dependency entirely.

### 19. Dark-mode primary buttons fail AA
`app/globals.css:41` — white on `#6e86ff` is 3.22:1 (2.63:1 on hover). Every
primary CTA in dark mode.
**Fix:** set `--color-on-accent: #0d1015` in the dark block only → 5.91:1.

### 20. `--color-faint` fails AA in both themes; light `--color-success` fails
3.10:1 and 4.14:1 on the surfaces they're used on — and these carry real content:
the address suffix, slug availability verdict, timezone hint, "Invitation sent".

### 21. Authorization denial renders an unstyled default 404
No `not-found.tsx`, `error.tsx`, or `loading.tsx` exists. `notFound()` is
deliberately our access-denial mechanism, so the most security-significant screen
in the product is Next's bare black-on-white page — no chrome, no way back.

### 22. Destructive row actions are unnamed and lose focus
`.../attendees/erase-button.tsx`, `.../attendees/page.tsx:211`

With 50 rows a screen reader hears "Erase, button" fifty times, identically, for an
irreversible deletion of personal data. Clicking it unmounts the trigger and mounts
the confirm pair, so focus drops to `<body>` and nothing announces the change.

**Fix:** per-row `aria-label` with the attendee name; focus the confirm button on
appearance.

### 23. Field errors aren't associated with their inputs
No `aria-invalid` or `aria-describedby` on any form except the signup slug field;
error text sits inside `<label>`, so it silently joins the accessible name.

### 24. Dashboard nav always highlights "Events"
`app/app/o/[slug]/layout.tsx:26` — hard-coded active styling, no `aria-current`.
On `/team` the nav lies about where you are.

### 25. Two timestamp formatters use the server's timezone
`.../attendees/page.tsx:19`, `.../team/page.tsx:8` — plain `toLocaleString`, so
"Registered 14:05" means whatever zone the deploy box is in, unlabelled. (Event
times are all correct — the hunt confirmed no event time is formatted without its
zone.)

---

## P3 — Privacy and compliance

26. **Tokens travel in URL query strings** (`/verify?token=`, `/invite?token=`) —
    contradicting our own written rule. The raw invitation token is additionally
    passed as a prop into client components, so it lands in the page payload.
27. **Verification performs a state-changing write during a GET render** — a
    mailbox link-prefetcher burns the token before the human clicks.
28. **Attendee search terms go in the URL** — `?q=jane.doe@example.com` in history,
    proxy logs, and `Referer`.
29. **No retention or purge logic exists anywhere.** `VerificationToken` stores the
    email address and is never deleted, even after use. Accepted invitations,
    registrations, and audit rows accumulate forever.
30. **Erasure is pseudonymisation.** Mechanically correct and non-invertible, but
    the row keeps `createdAt`, so an erased attendee is re-identifiable by joining
    against any CSV exported earlier.
31. **`CHECK_IN_REGISTRATION` is declared but never recorded** — the type promises
    coverage the code doesn't provide.
32. **No `reply_to` is set**, yet the confirmation email tells attendees to "reply
    to the organizer". That is the only rectification channel we offer, and it is
    non-functional.
33. **The privacy notice omits** the controller's identity, that Resend is a
    sub-processor, retention, and rights beyond erasure. No privacy policy page.
34. **`AuditLog` cascade-deletes with its tenant** — an accountability log that
    disappears with the entity it holds accountable.
35. **No security headers at all** — `next.config.ts` is empty: no CSP,
    `Referrer-Policy`, `X-Frame-Options`, or HSTS. Relevant because tokens are in
    query strings (26).

---

## P4 — Maintainability

36. `slugify` implemented three times, character-identical
    (`lib/events.ts`, `event-form.tsx`, `signup-form.tsx`) — the server comment
    says "mirrors the client-side preview" but nothing enforces it.
37. The input class string is copy-pasted 6×, the primary button 6×, the outline
    button ~10× — and **~11 files have no `focus-visible` styling at all** while
    the rest use `focus-visible:outline-none`, so keyboard focus is inconsistent.
38. `appOrigin()` duplicated; the `rootDomain`/`proto` pair inlined in 6 more
    places, with a `startsWith("localhost")` heuristic repeated 7×.
39. TTL constants exist but three pages hard-code "24 hours" / "a week" in prose.
40. Zod hand-copies the Prisma `Role` enum, plus three redundant `as Role` casts.
41. `statusStyles` typed `Record<string, string>` defeats exhaustiveness — a new
    status yields `class="… undefined"` with no error.
42. `revalidatePath` calls omit the `/app` prefix (route-tree paths, not visible
    paths), and two use form-supplied slugs instead of `ctx`-derived ones.
43. Six guards `return` silently with no feedback, so the UI reports success.
44. Dead code: `Parallax`, `tokensMatch` (a "constant-time compare" with no
    caller), `EventInput`, four scaffold SVGs, and a `tsx` dependency the docs
    explicitly forbid using.
45. `passwordHash!` — the codebase's only non-null assertion.
46. `Logo` needs `!important` overrides in four places because its size is
    hard-coded.
47. **No tests exist.** Ranked highest-value targets: DST gap/round-trip in
    `lib/time.ts`; the capacity race (the manual 20-way check we ran and never
    committed); `slugify` agreement across the three copies; `escapeCsvCell`
    payloads; `slugAvailability` around the 24h boundary; the `requireMembership`
    denial matrix.

---

## Documentation claims that are false or overstated

Nine, all written by us. Inaccurate security documentation is worse than none —
it stops people looking.

| Claim | Reality |
|---|---|
| "rate-limit register/signup/**login**" | Login has no rate limiting (#3) |
| "Never log tokens or registrant PII" | The console transport logs both (#5) |
| "never put either in a URL query string" | Both token flows do (#26) |
| "Public registration is rate limited **per address**" | It's per IP |
| "Reserved subdomains never resolve to a tenant" | `home` isn't reserved (#8) |
| "truly erased… name and email are gone" | Pseudonymised, re-identifiable (#30) |
| "Access to personal data is recorded" | Event deletion and check-ins aren't (#7, #31) |
| "A written data-retention policy accompanies the product" | No such document (#29) |
| "size-cap `customFields`" (acceptance criterion) | Not implemented |
| Cookies "HttpOnly + SameSite=Lax + Secure (in production)" | Auth.js defaults, never set by us; `secure` follows request protocol, not environment |

Also stale: a "known gap" about PENDING slugs that we fixed; the milestone list
duplicates M3/M4 and calls M6 upcoming; README says email is "wired in a later
milestone" and "M2 complete".

---

## Reported but disproved

**"Server-action `redirect()` 404s in five places, including signup and event
creation."** Ruled out by direct observation: both flows were exercised in the
browser during M2 and M3 and landed correctly. The auditor listed this as their own
top unverified suspicion. The underlying trap is real — it broke `/orgs`, which is
why the workaround exists there — but these five call sites work.

## Not verifiable without a running system

- Whether `revalidatePath` staleness (#42) is observable, or masked because the
  dashboard pages render dynamically.
- Cookie `Secure` behaviour at runtime.
- Whether `notFound()` inside the CSV export **route handler** yields a 404 or a
  500 — worth smoke-testing once the database is back up.
