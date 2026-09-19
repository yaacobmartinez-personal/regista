# Mobile API — implementation plan

The Flutter app in the sibling `thingstead-mobile` repository is built and
waiting on this backend. Its `docs/API-CONTRACT.md` is the specification; this
document is the plan for building it here, plus the corrections and decisions
that contract needs before work starts.

Status: **Phases 0, 1 and 2 are built** (the foundation, the seven endpoints
section 1 of the contract wrongly listed as already serving, and the fields the
app needs to run a door offline). Phases 3–9 are still plan. Decisions taken since the first draft are marked **Decided** below.

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
| 5 | `Registration.userId String?` + `@@index([userId])` | Tickets belong to an account (#13–#17) |
| 6 | `PasswordResetToken` model (hashed token, 1 h TTL, single-use) | Password reset (#4, #5) — **the web has no reset flow at all today** |
| 8 | `User.googleSub String? @unique`, `User.appleSub String? @unique` | Social sign-in (#6, #7) |
| 7 | New `AuditAction` value `CREATE_TENANT` | Org creation (#35) |
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
| 3 | Event CRUD | #18–#22 | `eventCrud` | none |
| 4 | Promote / erase / CSV export | #25–#27 | `promoteErase`, `csvExport` | none |
| 5 | Attendee mode — public reads, register, tickets | #8–#17 | `attendeeMode` | `Registration.userId` |
| 6 | Signup, email verification, password reset | #1–#5 | `signup`, `passwordReset` | `PasswordResetToken` |
| 7 | Org creation and team management | #28–#35 | `createOrg`, `team` | `CREATE_TENANT` audit |
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
6. **#24 gives `at` to E5 but not to E6, which loses most of what it is for.**
   The app queues *both* kinds of offline check-in, and the scanner is the
   busier path. `_replayScan` posts to `/mobile/checkin` with no time, so an
   offline scan replayed an hour later still records the replay time — exactly
   the problem `at` exists to fix, on the endpoint where it happens most. E6
   should take the same optional `at`, with the same bounds.

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
   `_replayScan` both post without a time. The server accepts and bounds `at`
   today, but until the Flutter interface carries the queued `clientAt` through,
   every replayed check-in is still stamped with the replay. Fixing this needs
   the E6 amendment in §6.6 as well, or scans stay wrong.
