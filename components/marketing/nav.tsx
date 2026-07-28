"use client";

import { useState } from "react";
import { motion, useScroll, useMotionValueEvent } from "motion/react";
import { Wordmark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

export function MarketingNav({
  loginUrl,
  signupUrl,
}: {
  loginUrl: string;
  signupUrl: string;
}) {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);

  useMotionValueEvent(scrollY, "change", (latest) => {
    const next = latest > 24;
    setScrolled((current) => (current === next ? current : next));
  });

  return (
    <motion.header
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: [0.21, 0.47, 0.32, 0.98] }}
      className={`sticky top-0 z-40 transition-all duration-300 ${
        scrolled
          ? "border-b border-line bg-canvas/85 backdrop-blur-md"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
        <Wordmark />
        <nav className="hidden items-center gap-8 text-sm text-muted md:flex">
          <a href="#how" className="transition-colors hover:text-fg">
            How it works
          </a>
          <a href="#features" className="transition-colors hover:text-fg">
            Features
          </a>
          <a href="#trust" className="transition-colors hover:text-fg">
            Trust
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <a
            href={loginUrl}
            className="hidden rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-fg sm:block"
          >
            Sign in
          </a>
          <a
            href={signupUrl}
            className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover"
          >
            Create organization
          </a>
        </div>
      </div>
    </motion.header>
  );
}
