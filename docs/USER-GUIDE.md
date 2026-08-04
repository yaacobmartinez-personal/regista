# Regista — user guide

How to run events on Regista, start to finish. This is the product guide for
organizers and their attendees; if you're setting the app up to run locally,
see the [developer guide](DEVELOPMENT.md) instead.

Throughout, **your organization's address** means the web address your events
live at — `your-org.<the Regista domain>`. Every organization gets its own, set
when you sign up. The dashboard where you manage everything lives at
`app.<the Regista domain>`.

> Running locally? The addresses become `your-org.localhost:3000` and
> `app.localhost:3000`. Emails are printed to the server console instead of being
> sent — the confirmation and invitation links are in there.

---

## 1. Who does what

Regista has three kinds of people:

- **Admins** — can manage events, attendees, **and the team** (invite people,
  change roles, remove members). The person who signs the organization up is the
  first admin.
- **Staff** — can manage events and attendees, but **not** the team. Good for
  helpers who run the door or tidy the guest list without administering the
  account.
- **Attendees** — members of the public who register for an event. They need no
  account; a private link in their confirmation email is how they manage their
  place.

A single sign-in can belong to more than one organization — you'll pick which one
you're working in from the switcher in the dashboard.

---

## 2. Creating your organization

1. Go to the Regista home page and choose **Sign up**.
2. Enter your organization's name, the address you'd like (this becomes
   `your-org.<domain>`), and your email and password. The address has to be
   lowercase letters, numbers and hyphens, and a few reserved names (`app`,
   `www`, `api` and similar) aren't available.
3. We email you a confirmation link. **Your organization stays inactive until you
   click it** — this proves the address belongs to you. The link is valid for 24
   hours.
4. Opening the link shows a confirmation screen; select **Confirm and activate**.
   Your organization is now live and you can sign in.

If you don't confirm, the address you chose is released after 24 hours so someone
else can use it — but only if nothing was created under it.

---

## 3. Signing in

Go to `app.<the Regista domain>` and sign in with your email and password. You
land on your dashboard. If you belong to more than one organization, use the
switcher to move between them.

Roles are checked on every action against the live account, so if an admin
changes your role or removes you, it takes effect immediately — not whenever you
next sign in.

---

## 4. Events

Your dashboard opens on the **Events** list. Each row shows the event, when it
is, how many people are registered (against capacity, if you set one), and its
status.

### The lifecycle: Draft → Published → Closed

- **Draft** — being prepared. Not visible to the public, no registration page.
- **Published** — live. Its public registration page is open and people can sign
  up.
- **Closed** — registration has ended. The page no longer accepts sign-ups.

Only **Published** events have a working public page. The **Publish** / **Close**
button on each row (and on the event's own page) moves it between published and
closed.

### Creating an event

1. From the Events list, choose **New event**.
2. Fill in:
   - **Title** — required.
   - **Address** — the last part of the event's public link. Left blank, it's
     made from the title; you can set your own. It's kept unique within your
     organization automatically.
   - **Description** — optional; shown on the public page.
   - **Start**, and optionally **End** — the date and time.
   - **Timezone** — the zone the event happens in. Everyone, wherever they are,
     sees the event at this local time, and the confirmation email agrees with
     the page. If you pick a start time that doesn't exist — the hour skipped
     when clocks go forward — Regista asks you to choose another, rather than
     silently shifting the event.
   - **Capacity** — optional. Leave blank for no limit.
   - **Waitlist** — when capacity is set, turn this on to let people join a
     waitlist once it's full instead of being turned away.
3. Save. The event starts as a **Draft**. Publish it when you're ready to open
   registration.

### Editing, and the public link

Open any event to edit it. When it's published, its page shows the live public
link — `your-org.<domain>/the-event` — which you can share.

Raising an event's capacity, or removing the limit, **automatically promotes**
the people who've waited longest off the waitlist into the freed places, in
order. (This is the one case that promotes on its own — see §5 for the other.)

### Deleting an event

**Admins** can delete an event from its page. This removes the event **and every
registration under it**, so it destroys more personal data than anything else in
the product — it's recorded in the audit log, and it can't be undone. Closing an
event is usually what you want instead: it stops new sign-ups while keeping the
guest list.

---

## 5. Attendees

From an event, choose **Attendees** to see everyone who's registered. The header
shows how many are registered (against capacity) and how many have checked in.

### Finding people

- **Search** by name or email.
- **Filter** by status: **Confirmed**, **Waitlist**, or **Cancelled**.

Search terms are kept out of the web address deliberately, so nobody's name ends
up in a browser history or a shared link.

### Statuses

- **Confirmed** — has a place.
- **Waitlist** — waiting for one, because the event was full when they signed up.
- **Cancelled** — gave up their place (see §7). The record is kept; the seat is
  freed.

### Check-in

Two ways to mark who's arrived:

- **Scan their code.** Open **Scan check-in** from the attendee list (or an
  event) to turn your phone into a scanner — point it at each attendee's QR code
  and they're marked present instantly, with clear feedback (a green "checked
  in", an amber "already checked in", a red "wrong event"). Attendees carry their
  code on their registration page (see §7); you can also paste a code by hand.
  Attendees can equally scan their own QR with their phone's camera, which opens
  the check-in page in your dashboard — either way works.
- **By hand.** In the attendee list, **Check in** marks someone present and
  **Undo check-in** reverses it.

Check-in times are recorded in the audit log, since they assert someone was
somewhere at a time.

### Promoting from the waitlist

When a place is free — you raised capacity, or someone cancelled — a waitlisted
person shows a **Promote** button. Pressing it gives them a confirmed place.
It's refused if the event is already full, so you can't accidentally oversell;
to let more people in, raise the capacity instead.

> Cancellations **don't** promote anyone automatically. A place coming free and
> deciding who gets it are two different things, and the second one is yours to
> make. Promote is how you make it.

### Exporting the guest list

**Export CSV** downloads the attendee list — for a badge printer, a check-in
sheet, or your records. The file is safe to open in any spreadsheet. Each export
is recorded in the audit log.

### Erasing someone's details (right to erasure)

If an attendee asks to be removed entirely, use **Erase** on their row and
confirm. This clears their name, email and any details, keeping an anonymous row
so your headcount stays right. It's **not reversible**, it's recorded in the
audit log, and it also disables the private link from their confirmation email.

Erasing is different from cancelling: cancelling frees a place but keeps the
record; erasing removes the personal data. An attendee cancelling their own place
does not erase anything.

---

## 6. Your team

**Admins** manage the team from **Team** in the dashboard.

- **Invite** a colleague by email and choose their role (Admin or Staff). They
  get an email with a single-use link that's valid for 7 days. It only works for
  the exact address you invited, and accepting it never lowers a role they
  already hold.
- **Pending invitations** are listed with their expiry; **Revoke** cancels one
  that hasn't been accepted.
- **Change roles** with **Make admin** / **Make staff**, and **Remove** members
  (or **Leave** yourself).
- Your organization always keeps **at least one admin** — the last admin can't be
  removed or demoted. Promote someone else first.

---

## 7. For your attendees

This is what the people signing up experience — worth knowing so you can answer
questions.

### Registering

On an event's public page they enter their name and email and register. If the
event is full and a waitlist is on, they join the waitlist; if it's full with no
waitlist, they're told it's full. The same email can only register once per
event. A privacy notice sits on the form, naming your organization as the one
holding the details.

### Their confirmation email

After registering they get a confirmation with the event details and a **private
link to their own place**. That link is the key to managing their registration —
they don't need an account. It's worth keeping to themselves: anyone who has it
can cancel on their behalf, and the email says so.

That page also shows their **check-in code** — a QR to show at the door, which a
staff member scans to mark them present (see §5). No printing needed; a phone
screen is enough.

### Cancelling

From that link they can see their registration and **give up their place**.
Cancelling is deliberate — it takes a click and a confirmation, so a link opened
by accident (or by a mail app fetching previews) never cancels anything. Once
they cancel, the place is freed and shows in your attendee list as **Cancelled**.

If they change their mind, they can sign up again on the event page — though the
place may be gone by then. Signing up again puts them at the **back** of the
waitlist if there is one, since they'd left the queue.

### Correcting or removing details

Changing details, or having them removed entirely, isn't self-service — they
reply to their confirmation email and you handle it (correct the record, or use
**Erase**). This keeps a real person in the loop for anything that alters or
deletes data.

---

## 8. A note on privacy

Regista keeps a light **audit log** — who exported, erased, checked in, or
promoted a registrant, and when. It records identifiers and timestamps only,
never the personal data itself, so you can answer "who touched this attendee's
details" without the log becoming another copy of them. Cancellations are logged
too, so a place coming free always has a reason attached.

How long different things are kept, and what's automated, is written up in
[docs/DATA-RETENTION.md](DATA-RETENTION.md).
