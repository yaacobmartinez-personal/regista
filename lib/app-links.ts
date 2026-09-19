/**
 * The native app's identity, for the two "well-known" files that let a link
 * to thingstead.pro open the app instead of the browser.
 *
 * Android verifies `assetlinks.json` against the certificate that signed the
 * installed APK. Play re-signs uploads with its own key, so both fingerprints
 * are listed: the upload key (for sideloaded and internal-test builds) and,
 * once Play App Signing has been set up, the app signing key. Add the latter
 * to ANDROID_CERT_SHA256 (comma-separated) from Play Console → Setup → App
 * signing; until then only the upload key verifies.
 *
 * Apple checks the AASA for `<TEAM_ID>.<bundle id>`. The Team ID is only known
 * once the Developer Program membership exists, so it comes from the
 * environment and the file is a 404 without it — a missing file is what iOS
 * expects for "no Universal Links yet", whereas a malformed one is cached as
 * a failure for days.
 */

export const ANDROID_PACKAGE = "pro.thingstead.app";
export const IOS_BUNDLE_ID = "pro.thingstead.app";

/** Upload key, from docs/RELEASE.md in the mobile repo. */
const UPLOAD_KEY_SHA256 =
  "A1:EF:0D:F6:19:B0:27:40:3F:5E:99:2B:56:F3:BB:D4:20:7B:14:AD:E8:EA:F0:F4:FF:7B:76:75:9E:1C:FC:87";

export function androidCertFingerprints(env: NodeJS.ProcessEnv = process.env): string[] {
  const extra = (env.ANDROID_CERT_SHA256 ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(s));
  return Array.from(new Set([UPLOAD_KEY_SHA256, ...extra]));
}

export function appleTeamId(env: NodeJS.ProcessEnv = process.env): string | null {
  const id = (env.APPLE_TEAM_ID ?? "").trim();
  return /^[A-Z0-9]{10}$/.test(id) ? id : null;
}

/** Paths on the apex that should open in the app when it is installed. */
export const APEX_APP_PATHS = ["/*"];

/**
 * Paths on app.<root> the native app handles. The dashboard itself stays in
 * the browser; only the token links the app can redeem are claimed.
 */
export const DASHBOARD_APP_PATHS = ["/checkin", "/checkin?*", "/verify", "/verify?*", "/reset", "/reset?*", "/invite", "/invite?*"];
