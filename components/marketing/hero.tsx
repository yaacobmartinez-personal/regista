"use client";

import { useRef } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
} from "motion/react";
import { EASE } from "@/components/motion/primitives";

const HEADLINE = ["Every", "organization", "runs", "its", "own", "event", "registration."];

export function Hero({ signupUrl }: { signupUrl: string }) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();

  // Hero recedes as the page scrolls past it.
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const contentY = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [0, 70]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.75], [1, 0]);
  const mockY = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [0, -50]);
  const mockRotate = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [0, -3]);
  const glowScale = useTransform(scrollYProgress, [0, 1], [1, 1.35]);

  return (
    <section
      ref={ref}
      className="relative overflow-hidden border-b border-line"
    >
      <motion.div
        aria-hidden
        style={{ scale: glowScale }}
        className="pointer-events-none absolute inset-x-0 -top-40 h-[560px] origin-top bg-[radial-gradient(60%_60%_at_60%_35%,color-mix(in_srgb,var(--color-accent)_16%,transparent),transparent_70%)]"
      />
      <GridBackdrop />

      <div className="relative mx-auto grid max-w-6xl items-center gap-16 px-5 pb-24 pt-20 lg:grid-cols-[1.05fr_1fr] lg:pb-32 lg:pt-28">
        <motion.div style={{ y: contentY, opacity: contentOpacity }}>
          {/* Word-by-word entrance */}
          <h1 className="flex flex-wrap gap-x-[0.28em] text-4xl font-semibold tracking-tight sm:text-5xl lg:text-[3.5rem] lg:leading-[1.04]">
            {HEADLINE.map((word, i) => (
              <span key={word} className="inline-block overflow-hidden pb-1">
                <motion.span
                  initial={{ y: reduce ? 0 : "100%", opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{
                    duration: reduce ? 0 : 0.8,
                    delay: reduce ? 0 : 0.15 + i * 0.06,
                    ease: EASE,
                  }}
                  className="inline-block"
                >
                  {word}
                </motion.span>
              </span>
            ))}
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.6, ease: EASE }}
            className="mt-6 max-w-xl text-lg text-muted"
          >
            Give your team a branded home for events — your own address, your own
            guest lists, your own dashboard. Publish an event, share the link, and
            watch registrations roll in.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.72, ease: EASE }}
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <a
              href={signupUrl}
              className="group relative overflow-hidden rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover"
            >
              <span className="relative z-10">Create your organization</span>
            </a>
            <a
              href="#how"
              className="rounded-lg border border-line-strong px-5 py-3 text-sm font-medium transition-colors hover:bg-panel"
            >
              See how it works
            </a>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.9 }}
            className="mt-6 font-mono text-xs text-faint"
          >
            Free to run events · No credit card · Live in minutes
          </motion.p>
        </motion.div>

        <motion.div
          style={{ y: mockY, rotate: mockRotate }}
          initial={{ opacity: 0, y: reduce ? 0 : 60, scale: reduce ? 1 : 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1, delay: 0.35, ease: EASE }}
        >
          <BrowserMock />
        </motion.div>
      </div>

      <ScrollCue />
    </section>
  );
}

function GridBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 opacity-[0.6] [mask-image:radial-gradient(70%_60%_at_50%_20%,#000,transparent)]"
      style={{
        backgroundImage:
          "linear-gradient(to right, var(--color-line) 1px, transparent 1px), linear-gradient(to bottom, var(--color-line) 1px, transparent 1px)",
        backgroundSize: "56px 56px",
      }}
    />
  );
}

function ScrollCue() {
  const reduce = useReducedMotion();
  return (
    <motion.div
      aria-hidden
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 1.2, duration: 0.8 }}
      className="relative mx-auto hidden w-fit pb-10 lg:block"
    >
      <motion.div
        animate={reduce ? {} : { y: [0, 7, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        className="flex flex-col items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-faint"
      >
        Scroll
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          className="h-4 w-4"
        >
          <path d="M12 5v14M6 13l6 6 6-6" />
        </svg>
      </motion.div>
    </motion.div>
  );
}

/** A tenant's live registration page — the product's most characteristic artifact. */
function BrowserMock() {
  const reduce = useReducedMotion();
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-2xl shadow-black/10">
      <div className="flex items-center gap-2 border-b border-line bg-panel px-3.5 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        <span className="ml-2 rounded-md bg-canvas px-2.5 py-1 font-mono text-[11px] text-muted">
          acme.regista.app
        </span>
      </div>

      <div className="space-y-5 p-6">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-panel text-sm font-semibold text-muted">
            A
          </span>
          <span className="font-semibold tracking-tight">Acme Events</span>
        </div>

        <div className="rounded-xl border border-line p-5">
          <p className="font-mono text-[11px] uppercase tracking-wider text-success">
            Registration open
          </p>
          <h3 className="mt-2 text-lg font-semibold tracking-tight">
            Acme Summer Meetup
          </h3>
          <p className="mt-1 text-sm text-muted">
            Thu, Aug 27 · 6:00 PM · Downtown Hall
          </p>

          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>92 of 100 registered</span>
              <span className="font-mono tabular-nums">92%</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-panel">
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 0.92 }}
                transition={{
                  duration: reduce ? 0 : 1.4,
                  delay: reduce ? 0 : 1,
                  ease: EASE,
                }}
                className="h-full origin-left rounded-full bg-accent"
              />
            </div>
          </div>

          <div className="mt-5 rounded-lg bg-accent px-4 py-2.5 text-center text-sm font-semibold text-on-accent">
            Register
          </div>
        </div>
      </div>
    </div>
  );
}
