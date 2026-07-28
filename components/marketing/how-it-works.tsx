"use client";

import { useRef } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useSpring,
  useReducedMotion,
} from "motion/react";
import { EASE, Reveal } from "@/components/motion/primitives";

const STEPS = [
  {
    n: "01",
    title: "Create your organization",
    body: "Sign up, name your organization, and claim your address — like acme.regista.app. Verify your email and you're live.",
    art: <ArtClaim />,
  },
  {
    n: "02",
    title: "Publish an event",
    body: "Add the details, set a capacity, switch on a waitlist. Publishing gives you a shareable registration page instantly.",
    art: <ArtPublish />,
  },
  {
    n: "03",
    title: "Manage everyone who signs up",
    body: "Track registrations as they arrive, check attendees in on the day, and export your guest list whenever you need it.",
    art: <ArtManage />,
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="border-b border-line">
      <PinnedTrack />
      <StackedFallback />
    </section>
  );
}

/* ---------------- Desktop: pinned horizontal track ---------------- */

function PinnedTrack() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });

  // Move the track through the panels while the section is pinned.
  const rawX = useTransform(scrollYProgress, [0, 1], ["0%", "-66.667%"]);
  const x = useSpring(rawX, { stiffness: 90, damping: 24, restDelta: 0.0005 });
  const railScale = useTransform(scrollYProgress, [0, 1], [1 / 3, 1]);

  if (reduce) return null;

  return (
    <div ref={ref} className="relative hidden h-[300vh] lg:block">
      <div className="sticky top-0 flex h-screen flex-col overflow-hidden">
        <div className="mx-auto w-full max-w-6xl px-5 pt-24">
          <p className="font-mono text-xs uppercase tracking-widest text-faint">
            How it works
          </p>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight">
            From sign-up to check-in, in three steps.
          </h2>
        </div>

        <motion.div style={{ x }} className="mt-auto flex w-[300%] flex-1 items-center">
          {STEPS.map((s) => (
            <div key={s.n} className="w-1/3 shrink-0 px-5">
              <div className="mx-auto grid max-w-5xl grid-cols-[1fr_1fr] items-center gap-14">
                <div>
                  <span className="font-mono text-sm text-accent">{s.n}</span>
                  <h3 className="mt-3 text-4xl font-semibold tracking-tight">
                    {s.title}
                  </h3>
                  <p className="mt-4 max-w-md text-lg text-muted">{s.body}</p>
                </div>
                <div className="flex justify-center">{s.art}</div>
              </div>
            </div>
          ))}
        </motion.div>

        {/* progress rail */}
        <div className="mx-auto w-full max-w-6xl px-5 pb-16">
          <div className="h-0.5 w-full overflow-hidden rounded-full bg-line">
            <motion.div
              style={{ scaleX: railScale }}
              className="h-full origin-left rounded-full bg-accent"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Mobile / reduced-motion: stacked ---------------- */

function StackedFallback() {
  const reduce = useReducedMotion();
  return (
    <div className={`mx-auto max-w-6xl px-5 py-20 ${reduce ? "" : "lg:hidden"}`}>
      <Reveal>
        <p className="font-mono text-xs uppercase tracking-widest text-faint">
          How it works
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight">
          From sign-up to check-in, in three steps.
        </h2>
      </Reveal>
      <ol className="mt-12 grid gap-6 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <Reveal key={s.n} delay={i * 0.08}>
            <li className="h-full rounded-2xl border border-line bg-surface p-6">
              <span className="font-mono text-sm text-accent">{s.n}</span>
              <h3 className="mt-3 text-lg font-semibold tracking-tight">
                {s.title}
              </h3>
              <p className="mt-2 text-sm text-muted">{s.body}</p>
            </li>
          </Reveal>
        ))}
      </ol>
    </div>
  );
}

/* ---------------- Step artwork ---------------- */

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.7, ease: EASE }}
      className="w-full max-w-sm rounded-xl border border-line bg-surface p-5 shadow-xl shadow-black/5"
    >
      {children}
    </motion.div>
  );
}

function ArtClaim() {
  return (
    <Frame>
      <p className="font-mono text-[11px] uppercase tracking-wider text-faint">
        Your address
      </p>
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-2.5">
        <span className="font-mono text-sm font-medium">acme</span>
        <span className="font-mono text-sm text-faint">.regista.app</span>
        <span className="ml-auto rounded-full bg-success-bg px-2 py-0.5 font-mono text-[10px] uppercase text-success">
          Available
        </span>
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-2 w-3/4 rounded-full bg-panel" />
        <div className="h-2 w-1/2 rounded-full bg-panel" />
      </div>
      <div className="mt-5 rounded-lg bg-accent px-4 py-2 text-center text-sm font-semibold text-on-accent">
        Claim it
      </div>
    </Frame>
  );
}

function ArtPublish() {
  return (
    <Frame>
      <div className="flex items-center justify-between">
        <p className="font-mono text-[11px] uppercase tracking-wider text-faint">
          New event
        </p>
        <span className="rounded-full bg-success-bg px-2 py-0.5 font-mono text-[10px] uppercase text-success">
          Published
        </span>
      </div>
      <h4 className="mt-3 font-semibold tracking-tight">Acme Summer Meetup</h4>
      <p className="mt-1 text-sm text-muted">Thu, Aug 27 · 6:00 PM</p>
      <div className="mt-4 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-lg border border-line p-2.5">
          <p className="font-mono text-[10px] uppercase text-faint">Capacity</p>
          <p className="mt-0.5 font-semibold tabular-nums">100</p>
        </div>
        <div className="rounded-lg border border-line p-2.5">
          <p className="font-mono text-[10px] uppercase text-faint">Waitlist</p>
          <p className="mt-0.5 font-semibold text-success">On</p>
        </div>
      </div>
    </Frame>
  );
}

function ArtManage() {
  const rows = [
    { name: "Priya Raman", state: "Checked in" },
    { name: "Tom Okafor", state: "Registered" },
    { name: "Ana Silva", state: "Registered" },
  ];
  return (
    <Frame>
      <div className="flex items-center justify-between">
        <p className="font-mono text-[11px] uppercase tracking-wider text-faint">
          Attendees
        </p>
        <span className="font-mono text-[11px] tabular-nums text-muted">92</span>
      </div>
      <ul className="mt-3 divide-y divide-line">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center justify-between py-2.5">
            <span className="flex items-center gap-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-panel text-[11px] font-semibold text-muted">
                {r.name.charAt(0)}
              </span>
              <span className="text-sm">{r.name}</span>
            </span>
            <span
              className={`font-mono text-[10px] uppercase ${
                r.state === "Checked in" ? "text-success" : "text-faint"
              }`}
            >
              {r.state}
            </span>
          </li>
        ))}
      </ul>
    </Frame>
  );
}
