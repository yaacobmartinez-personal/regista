import { NextResponse, type NextRequest } from "next/server";

// Resolve which "surface" a request belongs to and rewrite to the matching
// route-group folder. Two hosts, and paths within the apex:
//   app.<root>        -> app/app        (organizer dashboard, its own origin)
//   <root> /          -> app/home       (marketing)
//   <root> /signup    -> app/home       (marketing signup + check-email)
//   <root> /<tenant>  -> app/[domain]   (a tenant's public pages, by PATH)
//
// Tenant public pages live under a *path* on the apex, not a subdomain, so no
// wildcard DNS or wildcard TLS is needed — only the apex and one fixed `app.`
// record. Keeping the dashboard on its own subdomain preserves the session
// cookie's isolation: it is host-only for `app.<root>` and so is never sent to a
// tenant's public pages (see lib/auth.ts).
//
// Pure/edge-safe: no DB or auth imports. Auth + membership are enforced in server
// components (see lib/authz.ts).

export const config = {
  // Skip Next internals, the auth API, and files with an extension.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

function rootDomain(): string {
  return process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
}

function getSubdomain(host: string): string | null {
  const root = rootDomain().split(":")[0];
  const hostname = host.toLowerCase().split(":")[0];
  if (hostname === root || hostname === `www.${root}`) return null;
  if (hostname.endsWith(`.${root}`)) {
    return hostname.slice(0, hostname.length - root.length - 1);
  }
  return null;
}

// First path segments the apex serves as marketing rather than as a tenant.
// "/" is handled separately; "signup" covers /signup and /signup/check-email.
const MARKETING_SEGMENTS = new Set(["signup"]);

export default function proxy(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const { pathname, search } = req.nextUrl;
  const sub = getSubdomain(host);

  // ── Dashboard: its own subdomain, mapped to the /app route group. ──────────
  if (sub === "app") {
    const dest = new URL(`/app${pathname === "/" ? "" : pathname}`, req.url);
    dest.search = search;
    return NextResponse.rewrite(dest);
  }

  // ── A leftover tenant subdomain (old link, or a wildcard that still exists):
  //    send it to the path-based address so nothing 404s during the change. ──
  if (sub && sub !== "www") {
    const url = req.nextUrl.clone();
    url.host = rootDomain();
    url.pathname = `/${sub}${pathname === "/" ? "" : pathname}`;
    return NextResponse.redirect(url);
  }

  // ── Apex: marketing at the root and under /signup, tenants by path. ────────
  const first = pathname.split("/")[1] ?? "";

  if (first === "") {
    return NextResponse.rewrite(new URL("/home", req.url));
  }
  if (MARKETING_SEGMENTS.has(first)) {
    const dest = new URL(`/home${pathname}`, req.url);
    dest.search = search;
    return NextResponse.rewrite(dest);
  }
  // The dashboard belongs on its own subdomain; if someone reaches /app on the
  // apex, bounce them there rather than serving it from the wrong origin (which
  // would set the session cookie on the apex and leak it to tenant pages).
  if (first === "app") {
    const url = req.nextUrl.clone();
    url.host = `app.${rootDomain()}`;
    url.pathname = pathname.slice("/app".length) || "/";
    return NextResponse.redirect(url);
  }
  // Marketing lives at "/", not "/home".
  if (first === "home") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Anything else is a tenant's public pages: /<tenant>/... maps straight to the
  // app/[domain] route group, no rewrite needed. A non-existent tenant 404s
  // there (see app/[domain]). Reserved names (app/home/api/...) can't be tenant
  // slugs, so they never reach here as a tenant.
  return NextResponse.next();
}
