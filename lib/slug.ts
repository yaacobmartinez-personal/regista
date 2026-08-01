/**
 * Address and link slugs.
 *
 * Deliberately free of imports so the same code runs on the server, where the
 * value is authoritative, and in the browser, where it previews what the user
 * will get. This was three separate copies; the server one carried a comment
 * saying it "mirrors the client-side preview", with nothing enforcing that. If
 * they drifted, the preview would show a URL the person was never given.
 */

/** Names that must never resolve to a tenant. */
const ROUTE_GROUP_NAMES = ["home", "app", "api"] as const;

const CONVENTIONALLY_RESERVED = [
  "www",
  "admin",
  "mail",
  "smtp",
  "imap",
  "support",
  "login",
  "signup",
  "auth",
  "static",
  "assets",
  "cdn",
  "help",
  "status",
  "billing",
  "dashboard",
  "account",
  "security",
  "internal",
] as const;

const RESERVED_SUBDOMAINS = new Set<string>([
  // Load-bearing: these are the top-level route folders, so a tenant with one of
  // these slugs would have its subdomain rewritten into a first-party surface.
  ...ROUTE_GROUP_NAMES,
  ...CONVENTIONALLY_RESERVED,
]);

/** Turn free text into a URL segment. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 63);
}

export function isReservedSubdomain(slug: string): boolean {
  return RESERVED_SUBDOMAINS.has(slug);
}

/** 3–63 characters, lowercase alphanumeric with internal hyphens. */
export function isValidSlugShape(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/.test(slug);
}

/** Syntactically valid and not reserved. */
export function isUsableSlug(slug: string): boolean {
  return !isReservedSubdomain(slug) && isValidSlugShape(slug);
}
