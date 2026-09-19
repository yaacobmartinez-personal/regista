/**
 * Where things live.
 *
 * The `rootDomain` lookup and the "is this localhost, so http" guess were
 * written out longhand in eight places. Seven copies of a heuristic is seven
 * places to fix when it turns out to be wrong — it already is, for `127.0.0.1`
 * or a `.local` root domain.
 */

export function rootDomain(): string {
  return process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
}

/** http only for local development hosts; https everywhere else. */
export function protocol(): string {
  const host = rootDomain().split(":")[0];
  const isLocal =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "127.0.0.1" ||
    host.endsWith(".local");
  return isLocal ? "http" : "https";
}

/** Marketing site and signup. */
export function marketingOrigin(): string {
  return `${protocol()}://${rootDomain()}`;
}

/** Organizer dashboard. */
export function appOrigin(): string {
  return `${protocol()}://app.${rootDomain()}`;
}

/**
 * An organization's public base, without the scheme — the apex host plus its
 * path segment, e.g. `thingstead.pro/acme`.
 *
 * Tenants live at a path on the apex now, not a subdomain, so no wildcard DNS or
 * TLS is needed. This is what's shown when displaying an address (the dashboard,
 * the signup confirmation); the clickable URLs are built from it below.
 */
export function tenantPublicBase(slug: string): string {
  return `${rootDomain()}/${slug}`;
}

/** An organization's public site, with the scheme. */
export function tenantOrigin(slug: string): string {
  return `${protocol()}://${tenantPublicBase(slug)}`;
}

/** The public page for one event. */
export function eventUrl(tenantSlug: string, eventSlug: string): string {
  return `${tenantOrigin(tenantSlug)}/${eventSlug}`;
}

/**
 * Where a registrant manages their own place. The token goes in the query
 * string, as the verification link does; the app's Referrer-Policy is what stops
 * it leaking to anything the page links out to.
 */
export function manageRegistrationUrl(
  tenantSlug: string,
  eventSlug: string,
  rawToken: string,
): string {
  return `${eventUrl(tenantSlug, eventSlug)}/manage?token=${encodeURIComponent(rawToken)}`;
}

/**
 * The URL encoded in an attendee's QR ticket. It lives on the dashboard host, so
 * scanning it with a phone camera opens the check-in page in the staff member's
 * signed-in browser. The in-app scanner reads the same URL and pulls `c` out of
 * it, so one code serves both ways in.
 */
export function checkInUrl(rawToken: string): string {
  return `${appOrigin()}/checkin?c=${encodeURIComponent(rawToken)}`;
}

/**
 * The inverse of `checkInUrl`: recover the ticket token from whatever a scanner
 * produced.
 *
 * Decoding the QR yields the whole check-in URL, while someone typing a code
 * from a printed ticket yields the token on its own — both reach the door, so
 * both have to work. Anything else yields "", which resolves as an unknown
 * ticket rather than an error.
 */
export function extractCheckInCode(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;
  try {
    return new URL(trimmed).searchParams.get("c")?.trim() ?? "";
  } catch {
    return "";
  }
}

