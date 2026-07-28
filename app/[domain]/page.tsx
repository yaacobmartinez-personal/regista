import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { resolveActiveTenant } from "@/lib/tenant";
import { formatInZone, zoneLabel } from "@/lib/time";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

function formatWhen(startsAt: Date, timezone: string): string {
  const when = formatInZone(startsAt, timezone, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${when} ${zoneLabel(startsAt, timezone)}`;
}

export default async function TenantPublicHome({
  params,
}: {
  params: Promise<{ domain: string }>;
}) {
  const { domain } = await params;
  const tenant = await resolveActiveTenant(domain);
  if (!tenant) notFound();

  const events = await prisma.event.findMany({
    where: { tenantId: tenant.id, status: "PUBLISHED" },
    orderBy: { startsAt: "asc" },
  });

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-3.5">
          <span className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-panel text-sm font-semibold text-muted">
              {tenant.name.charAt(0).toUpperCase()}
            </span>
            <span className="font-semibold tracking-tight">{tenant.name}</span>
          </span>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-14">
        <h1 className="text-3xl font-semibold tracking-tight">Upcoming events</h1>

        {events.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-line-strong bg-surface p-10 text-center">
            <p className="text-sm text-muted">No published events just yet.</p>
          </div>
        ) : (
          <ul className="mt-8 flex flex-col gap-3">
            {events.map((event) => (
              <li key={event.id}>
                <Link
                  href={`/${event.slug}`}
                  className="flex items-center justify-between gap-4 rounded-xl border border-line bg-surface px-5 py-4 transition-colors hover:border-line-strong"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{event.title}</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {formatWhen(event.startsAt, event.timezone)}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm text-accent">Register →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <footer className="mt-16 flex items-center gap-1.5 border-t border-line pt-6 text-xs text-faint">
          <Logo className="!h-4 !w-4 !text-[10px]" />
          <span>Powered by Regista</span>
        </footer>
      </main>
    </div>
  );
}
