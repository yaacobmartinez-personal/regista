# Regista — Project Requirements (v1)

_Multitenant event registration platform. This document lists the requirements for the
first release (v1). It is derived from the approved implementation plan and its PM,
security, and privacy reviews._

**Status:** Approved for build · **Scope:** MVP / v1 · **Last updated:** 2026-07-27

---

## 1. Overview

Regista is a software-as-a-service (SaaS) platform that lets organizations ("tenants")
run their own event registration under their own web address (subdomain). Each
organization creates events, publishes a public registration page, collects free
registrations from the public, manages attendees, and invites teammates. Registrants
receive email confirmations.

**Personas**
- **Organizer (tenant Admin/Staff):** creates and runs events, manages attendees and team.
- **Registrant (public):** signs up to attend an event; no account required.
- **Platform operator:** runs Regista (acts as data *processor* on tenants' behalf).

---

## 2. Functional Requirements

### 2.1 Tenant Onboarding
- **FR-1** A new organization can self-serve sign up from the public site, creating an
  account, an organization, and choosing a unique subdomain (slug).
- **FR-2** Subdomain slugs are format-validated, checked for uniqueness, and rejected if
  they match a reserved-name blocklist (e.g. `app`, `www`, `api`, `admin`).
- **FR-3** A new organization stays **inactive until the owner verifies their email** via
  a link; only then does it become active and usable.

### 2.2 Authentication & Authorization
- **FR-4** Organizers sign in with email + password.
- **FR-5** A user may belong to multiple organizations; within each they hold a role of
  **Admin** or **Staff**.
- **FR-6** Admins can manage events, attendees, and team members. Staff can manage events
  and attendees but not team membership/roles.
- **FR-7** All organizer areas require authentication and confirmed membership in the
  organization being accessed.

### 2.3 Events
- **FR-8** An organizer can create, edit, and delete events (title, description, start/end
  time, optional capacity, waitlist toggle).
- **FR-9** Events have a lifecycle: **Draft → Published → Closed**. Only Published events
  accept public registrations.
- **FR-10** Each event has a unique, shareable public URL under the organization's subdomain.

### 2.4 Public Registration
- **FR-11** A member of the public can register for a Published event via a public form
  (name, email, optional custom fields) — no account required.
- **FR-12** When an event has a capacity limit, registration respects it: once full, new
  sign-ups go to a **waitlist** (if enabled) or are declined.
- **FR-13** A given email can register only once per event (duplicate sign-ups prevented).
  Someone who cancelled may sign up again; they rejoin any waitlist at the back.
- **FR-14** The registration form displays a **privacy notice** at the point of collection.
- **FR-25** A registrant can view their own place and **give it up**, from a private link in
  their confirmation email — no account required. Cancelling frees the place and keeps the
  record; it is not erasure, which stays a separate request (FR-18).

### 2.5 Attendee Management
- **FR-15** Organizers can view, search, and filter the attendee list for each event.
- **FR-16** Organizers can mark attendees as **checked in**.
- **FR-17** Organizers can **export** an event's attendees to CSV.
- **FR-18** Organizers can **delete/anonymize** a registrant's personal data (right to
  erasure), retaining an anonymized record for accurate counts.
- **FR-26** Organizers can **promote** a waitlisted attendee into a free place, up to the
  event's capacity. Places freed by cancellation are not filled automatically — who gets
  them is the organizer's decision.

### 2.6 Team Members
- **FR-19** Admins can invite teammates by email with a chosen role.
- **FR-20** An invited person accepts via a secure, single-use, expiring email link, which
  binds them to the organization.
- **FR-21** Admins can list members, change roles, and remove members.

### 2.7 Email Notifications
- **FR-22** A registrant receives a confirmation email after successfully registering.
- **FR-23** An invited teammate receives an invitation email.
- **FR-24** In development, emails are logged rather than sent (no live provider required).

---

## 3. Non-Functional Requirements

### 3.1 Multitenancy & Data Isolation
- **NFR-1** Each organization is reached at its own subdomain (`org.regista.app`).
- **NFR-2** Data is strictly isolated between organizations: no organization can read or
  modify another's events, attendees, or members under any circumstances.
- **NFR-3** The active organization is determined server-side; it can never be forced by a
  client-supplied value.

### 3.2 Security
- **NFR-4** Every data access is scoped to the authorized organization (protects against
  cross-tenant access / IDOR).
- **NFR-5** Roles and permissions are re-checked from the database on each request so that
  removing a member or changing a role takes effect immediately.
- **NFR-6** Passwords are stored using a strong hashing algorithm (argon2id/bcrypt);
  sign-in errors do not reveal whether an account exists.
- **NFR-7** Public endpoints (registration, signup, sign-in) are **rate-limited**.
- **NFR-8** Registration capacity is enforced atomically so simultaneous sign-ups cannot
  oversell the last seat.
- **NFR-9** Session cookies are restricted to the dashboard subdomain and marked
  Secure / HttpOnly / SameSite.
- **NFR-10** All input is validated against strict schemas; sensitive fields cannot be
  set by clients. CSV exports are safe against spreadsheet formula injection.

### 3.3 Privacy & Data Protection
- **NFR-11** The platform operator acts as a **data processor**; each organization is the
  **data controller** for its registrants.
- **NFR-12** Personal data can be truly erased/anonymized on request (see FR-18).
- **NFR-13** Access to personal data (exports, deletions) is recorded in an **audit log**.
- **NFR-14** Personal data and secrets never appear in logs or URLs; data is encrypted in
  transit (HTTPS).
- **NFR-15** A written data-retention policy accompanies the product.

### 3.4 Performance, Reliability & Usability
- **NFR-16** Public event and registration pages load quickly and work on mobile.
- **NFR-17** The system behaves correctly under concurrent registrations near capacity.
- **NFR-18** The organizer dashboard is usable without training for its core tasks.

---

## 4. Out of Scope (v1)

The following are intentionally deferred and **not** part of the first release:

- Paid ticketing / payments (Stripe Connect)
- Custom domains and per-tenant SSL
- Social / OAuth login
- Automatic waitlist promotion when a place is given up — the place is freed, but an
  organizer chooses who takes it (FR-26). Raising an event's capacity *does* promote
  automatically, since that is the organizer saying "let more people in".
- Registrant accounts and a full self-service portal. Registrants can view and cancel their
  own place from the link they were emailed (FR-25); anything more — changing their details,
  seeing every event they've signed up to — still goes through the organizer.
- Automatic post-event data-retention purge job
- CAPTCHA / advanced bot protection (basic rate limiting only in v1)
- Custom form-builder UI, reminder scheduling, analytics dashboards
- Marketing-consent capture / email marketing

---

## 5. Assumptions & Constraints

- **Stack:** Next.js (App Router) full-stack, Postgres, Prisma, Auth.js, Resend email.
- **Hosting:** wildcard-subdomain-capable host; managed Postgres. Data-residency choice
  (EU/US) to be decided before production launch.
- **Compliance:** GDPR-aware design; sub-processor agreements (email/hosting) and a
  breach-notification runbook to be completed before production launch.
- Events are **free**; no financial data is handled in v1.
