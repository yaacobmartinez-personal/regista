"use server";

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireMembership } from "@/lib/authz";
import { performCheckIn } from "@/lib/checkin";
import type { ScanResult } from "./shared";

/**
 * Mark an attendee present from a scanned ticket.
 *
 * Called imperatively by the scanner on each successful decode. The staff
 * member's tenant comes from their verified session, and the event is pinned to
 * the one whose scanner is open — so a ticket for another event reports "wrong
 * event" rather than checking someone in where they don't belong.
 *
 * A raw token or the whole check-in URL may be passed; we take the `c` param out
 * if it's a URL, so the same code works whether it was decoded in-app or the
 * scanner handed us what the camera saw.
 */
export async function scanCheckIn(input: {
  tenantSlug: string;
  eventSlug: string;
  code: string;
}): Promise<ScanResult> {
  const ctx = await requireMembership(input.tenantSlug);

  const event = await prisma.event.findFirst({
    where: { tenantId: ctx.tenant.id, slug: input.eventSlug },
    select: { id: true },
  });
  if (!event) notFound();

  const token = extractToken(input.code);
  if (!token) return { outcome: "invalid" };

  const result = await performCheckIn(
    { tenantId: ctx.tenant.id, userId: ctx.userId },
    token,
    { requireEventId: event.id },
  );

  return {
    outcome: result.outcome,
    name: result.name ?? null,
    atIso: result.at ? result.at.toISOString() : null,
    eventTitle: result.eventTitle,
  };
}

/** Pull the check-in token out of a scanned value — a bare token or a full URL. */
function extractToken(scanned: string): string | null {
  const value = scanned.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    const c = url.searchParams.get("c");
    if (c) return c;
  } catch {
    // Not a URL — treat it as the token itself.
  }
  return value;
}
