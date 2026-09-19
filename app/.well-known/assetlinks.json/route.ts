import { ANDROID_PACKAGE, androidCertFingerprints } from "@/lib/app-links";

/**
 * Android App Links. Served on every host the proxy lets through (the proxy
 * matcher skips dotted paths, so this never gets rewritten to a tenant page),
 * which is what we want: both thingstead.pro and app.thingstead.pro are in the
 * app's intent filters.
 *
 * Must be JSON, 200, no redirect, and reachable without cookies — Google's
 * verifier fetches it once at install time.
 */
export function GET() {
  const body = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: ANDROID_PACKAGE,
        sha256_cert_fingerprints: androidCertFingerprints(),
      },
    },
  ];
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=3600",
    },
  });
}
