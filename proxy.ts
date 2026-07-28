import { NextResponse, type NextRequest } from "next/server";

// Resolve which "surface" a request belongs to from its subdomain and rewrite to
// the matching route-group folder:
//   apex / www        -> app/home        (marketing + signup)
//   app.<root>        -> app/app         (organizer dashboard)
//   <tenant>.<root>   -> app/[domain]    (tenant public pages)
//
// This is pure/edge-safe: no DB or auth imports here. Auth + tenant membership
// are enforced in server components (see lib/authz.ts).

export const config = {
  // Skip Next internals, the auth API, and files with an extension.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

function getSubdomain(host: string): string | null {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
  const hostname = host.toLowerCase().split(":")[0];
  const root = rootDomain.split(":")[0];

  if (hostname === root || hostname === `www.${root}`) return null;
  if (hostname.endsWith(`.${root}`)) {
    return hostname.slice(0, hostname.length - root.length - 1);
  }
  return null;
}

export default function proxy(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const { pathname, search } = req.nextUrl;
  const sub = getSubdomain(host);

  let prefix: string;
  if (sub === null || sub === "www") prefix = "/home";
  else if (sub === "app") prefix = "/app";
  else prefix = `/${sub}`; // tenant public -> app/[domain]

  const dest = new URL(`${prefix}${pathname === "/" ? "" : pathname}`, req.url);
  dest.search = search;
  return NextResponse.rewrite(dest);
}
