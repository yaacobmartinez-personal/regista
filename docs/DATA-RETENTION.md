# Data retention policy

What Thingstead stores, how long it keeps it, and what is automated versus manual.

`docs/REQUIREMENTS.md` (NFR-15) states that a written retention policy accompanies
the product. This is that document — it did not exist until the privacy audit
pointed out the claim was unsupported.

**Status:** partial automation. What is automated is marked as such; everything
else is a manual or unimplemented step and is called out plainly rather than
implied.

---

## Roles

The operator of Thingstead is a **processor**. Each organization is the
**controller** for the people who register for its events, and decides how long
to keep their details. Thingstead's job is to make deletion possible and not to
retain anything the organization has not asked for.

---

## What is stored, and for how long

| Data | Contains | Retention | Automated |
|---|---|---|---|
| Registration (name, email) | Personal data | Until the organizer erases it | ✗ manual |
| Registration manage token | Hash only — no personal data itself | Life of the registration; cleared on erasure | ✗ manual |
| Erased registration | Anonymous row only | Kept indefinitely for attendance counts | n/a |
| Event, capacity, times | No personal data | Until the organizer deletes the event | ✗ manual |
| Verification token | Email address | 7 days after being used or expiring | ✓ `pruneExpiredRecords` |
| Invitation | Email address | 7 days after being accepted or expiring | ✓ `pruneExpiredRecords` |
| Membership | Links a user to an organization | Until removed from the team | ✗ manual |
| User account | Email, name, password hash | Until the account is deleted | ✗ not implemented |
| Audit log | Identifiers and timestamps only, **no personal data** | Indefinite, deliberately | n/a |
| Unverified organization | Name, chosen address | Released 24h after signup **if nothing was created under it** | ✓ on next claim |

### Notes on specific rows

**Erased registrations** keep `anonymizedAt`, a status, and a day-level
`createdAt`. Name, email, custom fields and check-in time are cleared and the
address replaced with a non-reversible placeholder. The row survives so capacity
and attendance figures stay correct. This is anonymisation within the system, not
destruction of every trace — see *Limits* below.

**The registration manage token** is what lets an attendee reach their own place
without an account, so unlike the other tokens here it has no expiry — the link
has to keep working until the event. It is stored as a SHA-256 hash, so a
database leak cannot be replayed as a live link, and it is cleared when the
registration is erased: left alive it would keep opening a page about someone who
asked to be forgotten. Signing up again after cancelling issues a new token and
retires the old one.

**The audit log** is retained indefinitely on purpose: it is the record of who
accessed or removed personal data, so expiring it would defeat its purpose. It
stores identifiers only, never the data itself, and the database refuses to
delete an organization that has one.

**Unverified organizations** are only released if they hold no events,
registrations, or audit entries. An abandoned signup that did nothing is
reclaimed; one that did anything is kept.

---

## How the automation runs

`pruneExpiredRecords` in [`lib/retention.ts`](../lib/retention.ts) removes spent
and expired verification tokens and invitations. There is no scheduler in this
deployment, so it runs two ways:

- opportunistically, detached, from the signup path;
- on demand: `pnpm db:prune`.

For a real deployment, run `pnpm db:prune` on a daily schedule rather than
relying on signup traffic.

---

## Limits — what this policy does not yet cover

Stated rather than glossed over.

- **No age-based deletion of registrations.** An event five years past still has
  its guest list in full unless an organizer removes it. A configurable
  post-event window is the obvious next step.
- **No account deletion.** A user account has no removal path in the product.
- **Backups and replication.** Erasure clears the live row. Point-in-time
  backups, write-ahead logs, and unvacuumed dead tuples retain earlier values
  until they age out. Erasure is not complete until a documented backup expiry
  has passed, and no such expiry is defined yet.
- **Copies that have left the system.** A CSV exported before an erasure still
  contains the person's details, and an email already delivered cannot be
  recalled. Exports are recorded in the audit log so an organizer can tell what
  they need to destroy themselves; nothing enforces that they do.
- **Resend** retains delivered message content according to its own policy.
  Erasure here does not propagate there. This needs covering in the data
  processing agreement before launch.

---

## Before going live

- Run `pnpm db:prune` on a schedule.
- Decide and document a backup retention period, since erasure is bounded by it.
- Put a data processing agreement in place with Resend and the hosting provider,
  and list them as sub-processors.
- Decide a default post-event retention window for registrations, and implement
  it.
