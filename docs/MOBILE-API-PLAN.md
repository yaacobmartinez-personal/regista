# Mobile API — implementation plan

The Flutter app in the sibling `thingstead-mobile` repository is built and
waiting on this backend. Its `docs/API-CONTRACT.md` is the specification; this
document is the plan for building it here, plus the corrections and decisions
that contract needs before work starts.

Status: **Phases 0–7 are built** — every contract item except social sign-in
(#6, #7) and the deep-link files (§3), both of which are blocked on values and
consoles outside this repository. Every suite runs in CI. Decisions taken since the first draft are marked **Decided** below.

---

## 0. Correction: nothing exists yet

The contract's section 1 lists seven endpoints as "real today" and cites
`regista/app/api/mobile/**` and `regista/lib/mobile-auth.ts`.

**Neither path exists on any branch of this repository.** Verified against
`origin/master` and every remote ref. The app's `server_url.dart` likewise cites
`regista/mobile/src/config.ts`, which also does not exist. The only route
handlers here are NextAuth's (`app/api/auth/[...nextauth]/route.ts`) and the web
CSV export.

Consequences:

- The work is **42 endpoints, not 35**. Section 1 (E1–E7) is Phase 1 below.
- The app cannot currently do anything against a real server. Every flag in
  `feature_availability.dart` is `false`, so `API_MODE=real` shows only the login
  screen — and `POST /mobile/auth/login` is itself one of the missing seven.
- `login` and `deleteAccount` are the only calls with no feature-flag guard, so
  they hit the network the moment a real build starts. They must ship first.

Section 2 of the contract is sound and is followed as written, except where
noted under "Contract corrections" below.

---

## 1. What already helps

- **Routing needs no change.** `proxy.ts`'s matcher excludes `api`, so
  `/api/**` bypasses host rewriting and resolves straight to `app/api/**` on
  both the apex and `app.`. Pick one canonical base URL for the app and leave
  the proxy alone.
- **The domain layer is reusable.** `lib/checkin.ts`, `lib/events.ts`,
  `lib/registrations.ts`, `lib/invitations.ts`, `lib/tenant.ts`, `lib/slug.ts`,
  `lib/time.ts`, `lib/csv.ts` and `lib/audit.ts` are transport-agnostic and take
  plain arguments. `performCheckIn`, `promoteFromWaitlist`, `eventInputSchema`,
  `uniqueEventSlug`, `slugAvailability`, `utcToZonedInput` and
  `inspectRegistration` are all directly callable from a route handler.
- **Route handlers are uncached by default** in Next 16, which is what an API
  wants. No `dynamic` config needed.

## 2. What blocks reuse

- **`requireMembership()` throws navigation.** `lib/authz.ts:41` calls
  `redirect("/login")` and `notFound()`. An API needs a status code and a JSON
  body, so it needs a sibling that returns a discriminated result instead of
  throwing. The web function stays as is.
- **Four operations live only in server actions**, not in `lib/`, and are
  wrapped in `FormData` parsing and `revalidatePath`:
  `promoteRegistration` and `eraseRegistration`
  (`app/app/o/[slug]/events/[eventSlug]/attendees/actions.ts`), the register
  transaction (`app/[domain]/[eventSlug]/actions.tsx`), and `inviteMember` /
  role and membership changes (`app/app/o/[slug]/team/actions.tsx`). Each must
  be lifted into `lib/` as a plain function that both the action and the route
  handler call. The web behaviour must not change.
- **`withLastAdminGuard` does not exist** as an exported symbol; the last-admin
  rule is inline in the team actions. It needs extracting with the rest.

## 3. Schema migrations required

| Phase | Change | For |
|---|---|---|
| **5 ✓** | `Registration.userId String?` + `@@index([userId])`, `onDelete: SetNull` | Tickets belong to an account (#13–#17) |
| **6 ✓** | `PasswordResetToken` model (hashed token, 1 h TTL, single-use) | Password reset (#4, #5) — the web had no reset flow at all; it does now |
| 8 | `User.googleSub String? @unique`, `User.appleSub String? @unique` | Social sign-in (#6, #7) |
| **7 ✓** | New `AuditAction` value `CREATE_TENANT` | Org creation (#35) |
| **0 ✓** | `Tenant.plan` (`PlanTier` = FREE/PREMIUM/CUSTOM, default FREE) | `Org.plan` in the contract |
| **0 ✓** | `User.tokenVersion Int @default(0)` | Token revocation (§9) |

**Decided:** `Tenant.plan` is built, not omitted. Paid tiers are coming in the
next version, and the column is cheap now — adding it later would mean changing a
shape the app has already shipped against. `GET /mobile/orgs` reports it from the
first release. Only `FREE` is ever set today; nothing reads the value yet.

## 4. Foundation to build first (Phase 0)

Three new modules, all under `lib/`:

**`lib/mobile-auth.ts`**
- `mintToken(userId)` → `base64url(JSON{sub, exp}) + "." + base64url(HMAC-SHA256(body, AUTH_SECRET))`, 30-day TTL.
- `verifyToken(raw)` → `{ sub }` or null. Constant-time signature compare.
- **`exp` is milliseconds since the epoch, not seconds** (**Decided**, and
  covered by `tests/mobile-auth.test.mjs`). `token_codec.dart` does
  `DateTime.fromMillisecondsSinceEpoch(exp)`; the JWT-conventional seconds would
  read as 1970, and the app would treat every token as already expired and never
  send the one it had just been given. This is the one detail that cannot be
  inferred from the format, so it is asserted rather than commented.
- Identity only, plus `ver` for revocation (§9). Membership and role are
  resolved from the database per request, exactly as `lib/authz.ts` does for the
  web.

**`lib/api-auth.ts`** — the non-throwing authz layer.
- `requireApiUser(req)` → `{ userId }` or a 401 response.
- `requireApiMembership(req, slug, minRole?)` → `TenantContext` or a response.
- Returns **403 uniformly** for "not a member", "insufficient role", "tenant not
  ACTIVE" *and* "tenant does not exist", per the contract. The uniformity is what
  prevents enumeration — this deliberately differs from the web, which 404s.

**`lib/api-response.ts`** — one place for the wire format.
- `{ error: string }`, optional `fieldErrors` and `reason`.
- A zod-error → `fieldErrors` mapper, producing the same messages the web
  server-action states already produce.
- Status vocabulary fixed by the contract: 400 / 401 / 403 / 404 / 409 / 429.

Rate limiting reuses `lib/rate-limit.ts` and `clientIp()` unchanged.

Next 16 specifics for every handler: files are `app/api/**/route.ts`; `params`
is a Promise (`const { slug } = await ctx.params`); type context with the global
`RouteContext<'/api/mobile/orgs/[slug]'>` helper.

## 5. Phases

Ordered so each one flips a flag in `feature_availability.dart` and is
independently shippable. Phase 1 is mandatory; everything after is a choice.

| # | Phase | Contract items | Flag | Schema |
|---|---|---|---|---|
| 0 ✓ | Foundation — token, authz, wire format | — | — | `plan`, `tokenVersion` |
| 1 ✓ | **The missing seven** — login, orgs, events, attendee list, check-in toggle, scan, close account | E1–E7 | *(ungated)* | none |
| 2 ✓ | Offline scan support — `checkInToken` and `waitlist` on the attendee payload, `at` on check-in | #23, #24 | `offlineTokens` | none |
| 3 ✓ | Event CRUD | #18–#22 | `eventCrud` | none |
| 4 ✓ | Promote / erase / CSV export | #25–#27 | `promoteErase`, `csvExport` | none |
| 5 ✓ | Attendee mode — public reads, register, tickets | #8–#17 | `attendeeMode` | `Registration.userId` |
| 6 ✓ | Signup, email verification, password reset | #1–#5 | `signup`, `passwordReset` | `PasswordResetToken` |
| 7 ✓ | Org creation and team management | #28–#35 | `createOrg`, `team` | `CREATE_TENANT` audit |
| 8 | Google and Apple sign-in | #6, #7 | `socialSignIn` | `googleSub`, `appleSub` |
| 9 | Deep-link hosting — `assetlinks.json`, `apple-app-site-association` | §3 | — | none |

Phases 1–4 are pure reuse of existing logic and add no new product concepts.
Phase 5 introduces account-owned registrations. Phase 6 introduces a user with
no tenant, which the web signup has never produced. Phase 8 carries the most
external risk (Apple/Google console config, JWKS verification, a test device).

Phase 9 needs values only the user has: the SHA-256 of both the upload key and
the Play App Signing key, and the Apple Team ID.

## 6. Contract corrections needed

1. Section 1 is not implemented — retitle it as work, not history.
2. Drop `plan` from the `Org` shape, or add a `Tenant.plan` column deliberately.
3. State that `exp` is milliseconds.
4. `501` for unshipped endpoints never happens: the app's `_require()` throws
   client-side before any request, and an unimplemented Next route returns 404.
   Harmless, but the contract should not promise it.
5. **#24 says "400 if `at` is in the future", which cannot be meant literally.**
   A phone's clock is the only source for an offline check-in and will not agree
   with the server's to the second, so a strict reading refuses legitimate door
   check-ins from a device two seconds fast and pushes them into the app's
   "needs attention" list. As built, a claim within five minutes ahead is
   clamped to now and only a larger gap is refused. See `lib/checkin-time.ts`.
6. ~~#24 gives `at` to E5 but not to E6.~~ **Amended and built.** E6 now takes
   the same optional `at`, with the same bounds, because the scanner is the
   busier of the two offline paths and leaving it out lost most of what `at`
   is for. The refusal and the clamp are split (`isImpossiblyAhead` and
   `clampDoorTime`) because the route can reject an impossible clock knowing
   only the time, while only `performCheckIn` holds the registration the lower
   bound needs; `resolveDoorTime` composes them and a test pins the three to
   agreeing.

## 7. Risks

- ~~No token revocation.~~ **Built in Phase 0** — see §9.
- **Rate limits are weaker than they look.** `lib/rate-limit.ts` is in-process
  memory, and the Render free plan sleeps after ~15 minutes idle, so counters
  reset on every cold start. The login limit (10/15 min) is the one that matters;
  a shared store is worth it before the app is public.
- **AUTH_SECRET is shared with NextAuth.** Works, but a separate
  `MOBILE_TOKEN_SECRET` means rotating one does not sign every web user out.
- **DB latency.** The Render service runs in Oregon while the Neon database is
  in `ap-southeast-1` (see the region note in `render.yaml` — the blueprint says
  Singapore but the live service was created in Oregon and Render cannot move
  it). Every endpoint here pays a cross-Pacific round trip per query, and mobile
  users are likely in APAC. Worth fixing before the app ships.
- **Security headers apply to `/api`.** `next.config.ts` sends the CSP and frame
  headers on `/:path*`. Harmless for a native client, but consider scoping them
  to non-API paths so JSON responses are not carrying a page policy.

## 8. Testing

Follows the existing split: `node --test` units under `tests/` for the token
codec and the zod→`fieldErrors` mapper, and `*.integration.mjs` against a real
database for the authz matrix (non-member, wrong role, inactive tenant) and the
check-in and registration races, which already have integration coverage to
extend.

---

## 9. Token revocation

A 30-day bearer token with no refresh endpoint is a long time to be unable to
take something back. `User.tokenVersion` is the answer, and it is built.

**How it works.** Every token carries the `ver` it was minted with. On each
request `requireApiUser` reads the user row — which it has to do anyway, to
confirm the account still exists — and rejects the token when `ver` no longer
matches the column. Revocation therefore costs no extra query. Raising the
number by one invalidates **every token ever issued to that account**, on every
device, at once.

```sql
UPDATE "User" SET "tokenVersion" = "tokenVersion" + 1 WHERE email = $1;
```

The next request from any of that person's devices gets a 401, and the app signs
out on a 401 by contract. They sign in again and get a token carrying the new
number. Nothing else is disturbed: the password still works, and their **web
session is untouched**, because that is a NextAuth cookie and knows nothing
about this column.

**What already uses it.** Closing an account (E7) increments it. That is what
actually ends the sessions — the row survives anonymization, so without the
bump every token minted for it would keep resolving for up to thirty days.

**When to reach for it.** A lost or stolen phone; a token pasted somewhere it
should not be; a password reset (once #5 ships, it should increment as a matter
of course — changing a password that leaves old sessions alive is a surprise);
and any suspicion about an account, where it is the cheapest safe action.

**What it deliberately is not.** It is per **account**, not per device: there is
no way to sign out one phone and leave another signed in, because nothing
identifies a device. Per-device revocation needs a token id in the payload and a
table of live tokens — real infrastructure, worth it only if the product grows a
"your devices" screen. The all-or-nothing version covers every case above and
costs one integer.

**Gaps worth knowing.** There is no UI for it — today it is a SQL statement run
by hand, which is fine while the operator and the developer are the same person
and worth a dashboard control before they are not. And revocation is not
instant-proof: a request already in flight when the number changes completes
normally. For a check-in API that is the right trade.

---

## 10. Phase 2 — what shipped, and what still blocks the offline door

Built on the server:

- **`checkInToken` on every attendee row** (null when erased, which erasure has
  already cleared anyway). The app caches the list and resolves a scanned ticket
  against it with no signal, giving the same named feedback offline as online.
  Sending it grants nothing new: the token is not a credential, and a member who
  can read this list can already check in anyone on it.
- **`waitlist` on the event header**, counted rather than derived from the
  returned array — which is capped at 500 and narrowed by `q`, so counting it
  would mislead on exactly the large events where the number matters.
- **`at` on E5**, bounded by `lib/checkin-time.ts`: refused when more than five
  minutes ahead, otherwise pulled into `[createdAt, now]`.

**Two client-side gaps remain before any of this reaches a door.**

1. `Feature.offlineTokens` is still `false` in the app's
   `feature_availability.dart`. One line, in the mobile repository.
2. **Nothing in the app sends `at` yet.** `CheckinRepository.setCheckedIn` has
   no such parameter, and neither does `scan`; `SyncWorker._replayManual` and
   `_replayScan` both post without a time. Both endpoints accept and bound `at`
   now (E5 from Phase 2, E6 from the §6.6 amendment), so the server side is
   complete — but until the Flutter interface carries the queued `clientAt`
   through, every replayed check-in is still stamped with the replay.

---

## 11. Phase 3 — event CRUD

Built: read one event (#18), create (#19), edit (#20), publish/close (#21) and
delete (#22). No migration. The rules the web already enforces are reused rather
than restated, including the two that are easy to miss — capacity cannot fall
below the number of people already holding a place, and raising it promotes the
longest-waiting in the same transaction.

Three things worth knowing about how it is put together:

- **One schema, two front ends.** `eventInputSchema` was written for a form,
  where everything arrives as a string. `lib/event-input.ts` converts a JSON
  body into that shape rather than adding a second schema, because the contract
  requires identical validation messages and two copies would drift. It is a
  pure module so the conversions are tested directly; a mistake there surfaces
  as the wrong message, or as a field silently cleared.
- **The response is re-read, not echoed.** After a create or an edit the event
  is loaded back from the database, so the counts reflect anyone promoted off
  the waitlist by the same request instead of what the request asked for.
- **`revalidateEventSurfaces` moved to `lib/event-surfaces.ts`** and is now
  shared with the web actions it came from. An event published from the app has
  to reach the public site for the same reason one published from the dashboard
  does; closing registrations while a cached page still offers a working sign-up
  form is the failure this prevents.

### Two gotchas recorded

- **`PATCH` (#20) is a full replace, not a partial update.** The contract says
  "same body" as #19, and the web form posts every field, so an omitted
  `description` or `endsAt` is stored as null rather than left alone. The app
  always sends the complete form, so this is safe today — but the verb invites
  a partial body from anyone hand-rolling a call, and that would quietly clear
  fields. Worth renaming to `PUT` in the contract, or documenting loudly.
- **The server does not validate slug *shape*.** `eventInputSchema` only caps it
  at 63 characters; `uniqueEventSlug` then slugifies whatever arrives. The app
  checks the shape itself and reports "Use 3–63 lowercase letters, numbers, or
  hyphens.", so a malformed slug never reaches the server from it — but a
  different client would get a silently cleaned address instead of that error.
  Pre-existing web behaviour, and it fails safe; flagged because the contract
  implies the messages match on every field, and here they do not.

---

## 12. Phase 4 — promote, erase, export

Built: promote one waitlisted person (#25), erase a registrant's details (#26),
and download the attendee CSV (#27). No migration.

`promoteRegistration` and `eraseRegistration` were the two operations that lived
only inside server actions, wrapped in `FormData` and `revalidatePath`. They are
now `promoteWaitlisted` and `eraseRegistrationData` in `lib/attendees.ts`, taking
the acting member's context and a registration id and knowing nothing about
forms or caches. The dashboard actions call them and keep their behaviour
exactly; the existing integration tests for the promote invariants still pass.

The CSV body moved with them, as `attendeeCsv`. Both exports now build from the
one function — the contract promises the same columns from both front ends, and
a spreadsheet that changed shape depending on which one produced it would break
whatever the organizer feeds it to.

### Three things that differ, deliberately

- **The export filename.** The contract specifies `<event-slug>-attendees.csv`
  and that is what the API sends. The dashboard's own download names it from the
  event *title* instead. Usually the same string, since the slug is derived from
  the title, but they part company after a rename or a slug collision — so the
  same event can download under two names depending on where you asked. Aligning
  them is a one-line change either way; the contract decided the API's half.
- **Promoting refreshes the public pages; the dashboard's control does not.**
  Confirming someone changes the seats left on the public event page, so the API
  revalidates it. The web's promote action only ever refreshed the attendee
  list, which means a promotion made from the dashboard can leave the public
  count stale — the same class of bug the event surfaces comment describes as
  already fixed for publishing. Left alone rather than changed quietly, since it
  is web behaviour and not this phase's remit. One line in
  `attendees/actions.ts` when you want it.
- **A missing registration id answers `200 {"outcome": "gone"}`, not 404.** That
  is what the lifted code does and what the app's `PromoteOutcome` expects, and
  it means a cross-tenant id is indistinguishable from a cancelled one. #25
  lists 404 among its errors; in practice only the organization check produces
  one. Erase does 404 a missing id, because `{ok: true}` there would claim an
  erasure that never happened.

---

## 13. Phase 5 — attendee mode

Built: the account and its organizations (#8, #9), the unauthenticated public
reads under `/api/public/*` (#10–#12), registering as a signed-in account (#13),
and tickets — list, read, import, cancel (#14–#17).

This is the first phase that adds a product concept rather than exposing an
existing one. Until now every registration was reached by the link in its
confirmation email and belonged to nobody; `Registration.userId` lets a place
belong to an account as well. The link keeps working and stays the only key for
the web form, which still takes no account.

### The register transaction is now shared

`registerForEvent` in `lib/register.tsx` is the code the public web form and the
API both run. The row lock, the waitlist decision and the rejoin-after-cancel
rule have one implementation, because two would eventually oversell an event.
What differs is only where the identity comes from: the form asks for a name and
an email, the app supplies the account's verified address and links the place to
it. The capacity-race integration test still passes — it holds at 5/5 under the
lock while its unlocked control oversells to 9.

### Decisions worth knowing

- **The address is always the account's, never the request's.** #13 takes only a
  name. A signed-in person can register themselves and no one else, so the
  endpoint cannot be used to book in someone else's name, nor to probe whether an
  address is already registered.
- **A duplicate claims the place.** Registering again for an event this account's
  address already holds answers `duplicate` *and* sets `userId` if it was unset.
  The contract only says to set it on create and on rejoin — but the response
  carries the ticket, and a ticket that never appeared in `GET /mobile/tickets`
  would be a bug. The address on the row is this account's verified address, so
  the place is already theirs.
- **Import requires matching addresses.** A confirmation link is emailed to one
  person and forwarding it is easy. Without the check, anyone passed a
  confirmation could attach a stranger's place to their account and read their
  name, status and ticket. The account's own address is verified, so it cannot be
  changed to defeat this.
- **Contention answers 429, not 500.** The event row lock deliberately
  serialises sign-ups, so a rush can exceed the transaction window. That is not
  an outcome the attendee can act on differently, and 429 is what the app already
  retries.
- **Closing an account detaches its places, it does not cancel them.** The
  organizer's headcount should not change because someone stopped using the app,
  so `userId` is nulled and the registration stands — the emailed link remains
  the way back to it. `onDelete: SetNull` on the relation says the same thing.
- **Erased and suspended rows are hidden from ticket reads.** An erased
  registration survives for the organizer's counts but no longer describes a
  person, and a suspended organization's pages are not served — so neither
  appears in a ticket list.

---

## 14. Phase 6 — accounts, confirmation, password reset

Built: signing up for a personal account (#1), confirming an address and being
signed in by it (#2), resending that confirmation (#3), and the password reset
the product has never had (#4, #5).

Two things here are new to the product rather than new to the API.

**An account with no organization.** Web signup has only ever created one as a
side effect of creating an organization. `signupAccount` creates a bare account
and mints a `VerificationToken` with a null `tenantId`; `redeemVerification` now
handles both kinds, activating an organization when the token names one and
confirming the address either way. The web's `/verify` page rejects a token with
no organization behind it, since it has nothing to show for one.

**A password reset, on the web as well as in the app.** The contract asks for a
page at `app.<root>/reset?token=` "for users without the app" — but a page to
*spend* a link is no use to someone with no way to *request* one, so `/forgot`
is there too, linked from the sign-in form. That is slightly more than the
contract specifies and the reason is in the contract's own sentence.

### Decisions worth knowing

- **Every one of these endpoints answers the same way whatever the address.**
  Signing up with a free address, one that already has a confirmed account, and
  one signed up for but never confirmed all return `{ok: true}`; forgot-password
  answers identically for an address with no account. The reply reaches whoever
  typed the address, not whoever owns it, so any difference is a way to test
  addresses against the user table. Asserted, byte for byte, in the API suite.
- **An unconfirmed account stays claimable, a confirmed one does not.** The rule
  the web signup already applies: nobody has proven control of an unconfirmed
  address, so the password on it has no owner. A confirmed account keeps its
  password no matter who signs up with its address.
- **A reset ends every other session.** It spends every other outstanding link
  for the account, confirms the address if it was not already — receiving the
  link proves the same thing verification asks for — and raises `tokenVersion`,
  which signs out every device. Someone resetting a password usually believes an
  account is compromised, so leaving old sessions alive would be a surprise.
- **Signup survives a missing mail provider.** `sendEmail` *throws* rather than
  logging when `RESEND_API_KEY` is unset in production, which is how the
  deployment runs until a sending domain is verified. The first version of
  `signupAccount` awaited it uncaught, so signup would have returned 500 on the
  live site while quietly creating the account — and a retry would have failed
  the same way. The send is now wrapped, as the web signup's already was, and
  the API suite covers it.
- **Reset tokens are pruned.** They hold an email address, so they join
  `pruneExpiredRecords` and `pnpm db:prune` alongside verification tokens and
  invitations, and the retention table records them.

---

## 15. Phase 7 — team and organizations

Built: the team and its outstanding invitations (#28), inviting (#29), revoking
(#30), changing a role (#31), removing a member or leaving (#32), accepting an
invitation in the app (#33), checking an address (#34) and creating an
organization (#35).

`withLastAdminGuard` was the last thing living only inside a server action. It
is in `lib/team.tsx` now with the rest, and it gained one thing the dashboard
never needed: it says *why* it refused. The web treated "no such membership" and
"that would leave no admin" alike, because both mean "nothing changed" to a page
that re-renders either way. The app has to tell someone what to do about it, so
the guard returns `applied`, `last_admin` or `gone`, and the API answers 409
with `reason: "last_admin"` or 404.

### Decisions worth knowing

- **An organization can never be left without an admin.** Not by demotion, not
  by removal, not by leaving. The count happens inside the same transaction as
  the write, behind a row lock, so two admins leaving at the same moment cannot
  both pass it. Worth the care: every route that could appoint a new admin
  requires an admin, so an organization that loses its last one has no way back
  in.
- **Accepting an invitation checks the address.** Same reasoning as importing a
  ticket: an invitation is emailed to one person, forwarding it is easy, and
  without the check anyone passed the link could put themselves inside an
  organization. `redeemInvitation` also refuses to change an existing
  membership, so an old STAFF link cannot quietly demote a sitting admin.
- **A failed invitation email is a 502, not a silent success.** The row exists
  and is listed as pending, but nobody was told — the admin needs to know that,
  so they can revoke and try again. The body carries the invitation so the app
  can show what was made.
- **An organization created from the app is ACTIVE immediately.** Web signup
  leaves one PENDING until its owner proves they own the address; this caller
  proved it already, because being signed in is what that means. Asking again
  would be asking twice.
- **`/mobile/orgs/availability` requires a session.** The contract does not say
  so either way. It reads the tenant table by name, and there is no reason to
  let the world enumerate addresses — the app has a token by the time it shows
  that form.
