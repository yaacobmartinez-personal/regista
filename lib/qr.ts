import QRCode from "qrcode";

/**
 * Render a string as an inline SVG QR code.
 *
 * SVG so it stays crisp on a printed ticket and on any screen, and self-contained
 * so it needs no image request. The input is always a URL we built ourselves
 * (see lib/urls.ts `checkInUrl`), never user text, so the markup is safe to
 * inline. Server-only — `qrcode` is a Node module.
 */
export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
  });
}
