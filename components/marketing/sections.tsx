"use client";

import { useRef } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
} from "motion/react";
import {
  EASE,
  Reveal,
  RevealGroup,
  RevealItem,
} from "@/components/motion/primitives";

/* ---------------- Features ---------------- */

const FEATURES = [
  {
    title: "Your own branded address",
    body: "Each organization gets its own address — a registration home that feels like yours, not ours.",
    icon: <GlobeIcon />,
  },
  {
    title: "Events in minutes",
    body: "Draft, publish, and close events with capacity limits and automatic waitlists.",
    icon: <CalendarIcon />,
  },
  {
    title: "Know who's coming",
    body: "A searchable guest list, and CSV export whenever you need it for badges or the door.",
    icon: <UsersIcon />,
  },
  {
    title: "Check them in with a scan",
    body: "Turn any phone into a scanner — read each attendee's QR code and they're marked present on the spot.",
    icon: <ScanIcon />,
  },
  {
    title: "Confirmations, automatic",
    body: "Every registrant gets a confirmation email — carrying their check-in code — the moment they sign up.",
    icon: <MailIcon />,
  },
  {
    title: "Attendees manage themselves",
    body: "A private link lets each registrant view or give up their place — no account, no back-and-forth.",
    icon: <TicketIcon />,
  },
  {
    title: "Your team, right access",
    body: "Invite colleagues with admin or staff roles — everyone scoped to your organization.",
    icon: <TeamIcon />,
  },
  {
    title: "Private by design",
    body: "Strict separation between organizations and real control over attendee data.",
    icon: <ShieldIcon />,
  },
];

export function Features() {
  return (
    <section id="features" className="border-b border-line">
      <div className="mx-auto max-w-6xl px-5 py-24">
        <Reveal>
          <p className="font-mono text-xs uppercase tracking-widest text-faint">
            Features
          </p>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight">
            Everything you need to run registration.
          </h2>
          <p className="mt-3 max-w-xl text-muted">
            No spreadsheets, no shared inboxes — one place to publish events and
            manage everyone who signs up.
          </p>
        </Reveal>

        <RevealGroup className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <RevealItem key={f.title}>
              <motion.div
                whileHover={{ y: -4 }}
                transition={{ duration: 0.25, ease: EASE }}
                className="h-full rounded-2xl border border-line bg-surface p-6 transition-colors hover:border-line-strong"
              >
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-gold/10 text-gold">
                  {f.icon}
                </span>
                <h3 className="mt-4 text-base font-semibold tracking-tight">
                  {f.title}
                </h3>
                <p className="mt-1.5 text-sm text-muted">{f.body}</p>
              </motion.div>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}

/* ---------------- Trust ---------------- */

const TRUST = [
  {
    title: "Strict separation",
    body: "No organization can ever see another's events, attendees, or team.",
  },
  {
    title: "Right to be forgotten",
    body: "A registrant's details can be truly erased while your counts stay accurate.",
  },
  {
    title: "Access always re-checked",
    body: "Remove a teammate and their access ends immediately — no lingering sessions.",
  },
];

export function Trust() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [40, -40]);

  return (
    <section id="trust" ref={ref} className="relative overflow-hidden border-b border-line">
      <motion.div
        aria-hidden
        style={{ y }}
        className="pointer-events-none absolute inset-x-0 top-0 h-[400px] bg-[radial-gradient(50%_50%_at_20%_30%,color-mix(in_srgb,var(--color-success)_10%,transparent),transparent_70%)]"
      />
      <div className="relative mx-auto max-w-6xl px-5 py-24">
        <Reveal>
          <p className="font-mono text-xs uppercase tracking-widest text-faint">
            Trust
          </p>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight">
            Your attendees&apos; details, handled with care.
          </h2>
        </Reveal>

        <RevealGroup className="mt-12 grid gap-6 md:grid-cols-3">
          {TRUST.map((t) => (
            <RevealItem key={t.title}>
              <div className="flex gap-3.5">
                <span className="mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-full border border-success text-success">
                  <CheckIcon />
                </span>
                <div>
                  <h3 className="text-sm font-semibold">{t.title}</h3>
                  <p className="mt-1 text-sm text-muted">{t.body}</p>
                </div>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}

/* ---------------- CTA ---------------- */

export function CallToAction({ signupUrl }: { signupUrl: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "center center"],
  });
  const scale = useTransform(scrollYProgress, [0, 1], reduce ? [1, 1] : [0.94, 1]);

  return (
    <section className="border-b border-line">
      <div ref={ref} className="mx-auto max-w-6xl px-5 py-24">
        <motion.div
          style={{ scale }}
          className="relative overflow-hidden rounded-3xl border border-line bg-surface px-8 py-16 text-center"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_120%_at_50%_-20%,color-mix(in_srgb,var(--color-accent)_14%,transparent),transparent_70%)]"
          />
          <Reveal className="relative">
            <h2 className="mx-auto max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Start running your events today.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-muted">
              Claim your organization&apos;s address and publish your first event
              in minutes.
            </p>
            <a
              href={signupUrl}
              className="mt-8 inline-block rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover"
            >
              Create your organization
            </a>
          </Reveal>
        </motion.div>
      </div>
    </section>
  );
}

/* ---------------- icons ---------------- */

function iconProps() {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-5 w-5",
  };
}
function GlobeIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg {...iconProps()}>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v3M16 3v3" />
    </svg>
  );
}
function UsersIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 6.5a3 3 0 0 1 0 5.8M18.5 20a5.5 5.5 0 0 0-3-4.9" />
    </svg>
  );
}
function MailIcon() {
  return (
    <svg {...iconProps()}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 6.5 8.5 6 8.5-6" />
    </svg>
  );
}
function ScanIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
      <path d="M4 12h16" />
    </svg>
  );
}
function TicketIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 6 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-6Z" />
      <path d="M14.5 7.5v9" />
    </svg>
  );
}
function TeamIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="12" cy="8" r="3" />
      <path d="M6 20a6 6 0 0 1 12 0" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3 w-3"
    >
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}
