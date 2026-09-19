import { APEX_APP_PATHS, DASHBOARD_APP_PATHS, IOS_BUNDLE_ID, appleTeamId } from "@/lib/app-links";

/**
 * iOS Universal Links. Apple's CDN fetches this from each associated domain,
 * so it is served without an extension and as JSON.
 *
 * Which paths are claimed depends on the host: everything on the apex (tenant
 * and event pages), only the token links on the dashboard host. Without a
 * Team ID this is a 404 on purpose — see lib/app-links.ts.
 */
export function GET(request: Request) {
  const teamId = appleTeamId();
  if (!teamId) return new Response(null, { status: 404 });

  const host = (request.headers.get("host") ?? "").toLowerCase();
  const onDashboard = host.startsWith("app.");
  const body = {
    applinks: {
      apps: [],
      details: [
        {
          appIDs: [`${teamId}.${IOS_BUNDLE_ID}`],
          paths: onDashboard ? DASHBOARD_APP_PATHS : APEX_APP_PATHS,
        },
      ],
    },
  };
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=3600",
    },
  });
}
