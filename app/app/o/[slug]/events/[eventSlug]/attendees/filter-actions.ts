"use server";

import { cookies } from "next/headers";
import { requireMembership } from "@/lib/authz";
import {
  attendeeFilterCookie,
  FILTER_COOKIE_MAX_AGE,
  type AttendeeFilter,
} from "./filter-shared";

/**
 * Attendee list filters, held in a cookie rather than the query string.
 *
 * Searching for someone means typing their name or email, and a GET form puts
 * that straight into the address bar — from where it reaches browser history,
 * the `Referer` header, and every proxy and access log on the way. Keeping it in
 * a short-lived httpOnly cookie means the search still works and survives
 * paging, without the term being written down everywhere.
 *
 * The trade-off is that a filtered view is no longer shareable by URL, which for
 * a list of people's contact details is arguably the right outcome.
 */

export async function applyAttendeeFilter(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const eventId = String(formData.get("eventId") ?? "");
  await requireMembership(tenantSlug);

  const filter: AttendeeFilter = {
    q: String(formData.get("q") ?? "").trim().slice(0, 120),
    status: String(formData.get("status") ?? "ALL"),
  };

  const jar = await cookies();
  const name = attendeeFilterCookie(eventId);

  if (!filter.q && filter.status === "ALL") {
    jar.delete(name);
    return;
  }

  jar.set(name, JSON.stringify(filter), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: FILTER_COOKIE_MAX_AGE,
    path: "/",
  });
}

export async function clearAttendeeFilter(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const eventId = String(formData.get("eventId") ?? "");
  await requireMembership(tenantSlug);

  const jar = await cookies();
  jar.delete(attendeeFilterCookie(eventId));
}
