import { notFound } from "next/navigation";
import { resolveActiveTenant } from "@/lib/tenant";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function TenantPublicHome({
  params,
}: {
  params: Promise<{ domain: string }>;
}) {
  const { domain } = await params;
  const tenant = await resolveActiveTenant(domain);
  if (!tenant) notFound();

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

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">
          Upcoming events
        </h1>
        <p className="mt-3 max-w-prose text-muted">
          This is {tenant.name}&apos;s public page. Published events and their
          registration forms will appear here.
        </p>
        <div className="mt-8 rounded-xl border border-dashed border-line-strong bg-surface p-10 text-center">
          <p className="text-sm text-muted">No published events yet.</p>
        </div>

        <footer className="mt-12 flex items-center gap-1.5 text-xs text-faint">
          <Logo className="!h-4 !w-4 !text-[10px]" />
          <span>Powered by Regista</span>
        </footer>
      </main>
    </div>
  );
}
