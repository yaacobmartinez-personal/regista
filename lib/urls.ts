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

/** An organization's public host, without the scheme. */
export function tenantHost(slug: string): string {
  return `${slug}.${rootDomain()}`;
}

/** An organization's public site. */
export function tenantOrigin(slug: string): string {
  return `${protocol()}://${tenantHost(slug)}`;
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
