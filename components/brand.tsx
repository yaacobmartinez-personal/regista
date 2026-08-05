import Link from "next/link";

/**
 * The Thingstead mark: six people gathered in a ring (the "Thing", an assembly)
 * around a central pillar "T" (the "stead", the place). Drawn as inline SVG so it
 * stays crisp at any size and follows the theme — the ring is gold, the pillar is
 * the foreground ink, which flips to a light tone in dark mode. Decorative: every
 * placement pairs it with the wordmark, so it is hidden from assistive tech.
 */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={`h-7 w-7 ${className}`} aria-hidden>
      <polygon
        points="26.39,10 16,4 5.61,10 5.61,22 16,28 26.39,22"
        fill="none"
        stroke="var(--color-gold)"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <g fill="var(--color-gold)">
        <circle cx="16" cy="4" r="2.5" />
        <circle cx="26.39" cy="10" r="2.5" />
        <circle cx="26.39" cy="22" r="2.5" />
        <circle cx="16" cy="28" r="2.5" />
        <circle cx="5.61" cy="22" r="2.5" />
        <circle cx="5.61" cy="10" r="2.5" />
      </g>
      <g fill="var(--color-fg)">
        <rect x="10.4" y="10.6" width="11.2" height="2.7" rx="0.7" />
        <rect x="14.5" y="10.6" width="3" height="10.8" rx="0.7" />
        <rect x="11.8" y="20.4" width="8.4" height="2.5" rx="0.7" />
      </g>
    </svg>
  );
}

export function Wordmark({ href }: { href?: string }) {
  const inner = (
    <span className="flex items-center gap-2">
      <Logo />
      <span className="font-semibold tracking-tight">Thingstead</span>
    </span>
  );
  return href ? (
    <Link href={href} className="inline-flex">
      {inner}
    </Link>
  ) : (
    inner
  );
}
