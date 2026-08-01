import { requireMembership } from "@/lib/authz";
import { supportedTimeZones } from "@/lib/time";
import { tenantHost } from "@/lib/urls";
import { EventForm } from "../event-form";

export default async function NewEventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requireMembership(slug);


  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">New event</h1>
      <p className="mt-1 text-sm text-muted">
        Events start as a draft. Publish when you&apos;re ready to take
        registrations.
      </p>
      <EventForm
        tenantSlug={ctx.tenant.slug}
        publicHost={tenantHost(ctx.tenant.slug)}
        timeZones={supportedTimeZones()}
      />
    </main>
  );
}
