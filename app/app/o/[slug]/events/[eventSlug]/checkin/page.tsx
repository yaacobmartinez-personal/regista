import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { Scanner } from "./scanner";

export const metadata = { title: "Check in — Regista" };

export default async function CheckInPage({
  params,
}: {
  params: Promise<{ slug: string; eventSlug: string }>;
}) {
  const { slug, eventSlug } = await params;
  const ctx = await requireMembership(slug);

  const event = await prisma.event.findFirst({
    where: { tenantId: ctx.tenant.id, slug: eventSlug },
    select: { title: true, slug: true },
  });
  if (!event) notFound();

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-8">
      <Link
        href={`/o/${ctx.tenant.slug}/events/${event.slug}/attendees`}
        className="text-sm text-muted underline-offset-4 hover:text-fg hover:underline"
      >
        ← Attendees
      </Link>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Check in</h1>
      <p className="mt-1 text-sm text-muted">
        Scanning tickets for <span className="font-medium text-fg">{event.title}</span>.
      </p>

      <div className="mt-6">
        <Scanner tenantSlug={ctx.tenant.slug} eventSlug={event.slug} />
      </div>
    </main>
  );
}
