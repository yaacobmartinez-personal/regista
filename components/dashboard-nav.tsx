"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Section nav for a tenant dashboard.
 *
 * Client-side so the active tab reflects where you actually are — it used to be
 * hard-coded to "Events", so the nav claimed you were on Events while you were
 * looking at Team. `aria-current` carries the same fact to assistive tech,
 * which had nothing at all before.
 */
export function DashboardNav({
  tenantSlug,
  showTeam,
}: {
  tenantSlug: string;
  showTeam: boolean;
}) {
  const pathname = usePathname() ?? "";
  const base = `/o/${tenantSlug}`;

  const items = [
    { href: base, label: "Events", active: !pathname.startsWith(`${base}/team`) },
    ...(showTeam
      ? [
          {
            href: `${base}/team`,
            label: "Team",
            active: pathname.startsWith(`${base}/team`),
          },
        ]
      : []),
  ];

  return (
    <nav className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-5xl gap-5 px-5">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={item.active ? "page" : undefined}
            className={
              item.active
                ? "border-b-2 border-accent py-3 text-sm font-semibold"
                : "border-b-2 border-transparent py-3 text-sm text-muted transition-colors hover:text-fg"
            }
          >
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
