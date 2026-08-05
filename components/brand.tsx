import Link from "next/link";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span
      className={`grid h-7 w-7 place-items-center rounded-lg bg-accent text-sm font-bold text-on-accent ${className}`}
      aria-hidden
    >
      T
    </span>
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
