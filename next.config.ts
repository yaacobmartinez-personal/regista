import type { NextConfig } from "next";

/**
 * Response headers.
 *
 * `Referrer-Policy` is doing real work here, not box-ticking: verification and
 * invitation links carry a single-use token in the query string, and the
 * attendee search puts a name or email there. Without this, following any
 * outbound link from those pages would hand the destination that value in the
 * `Referer` header.
 */
const securityHeaders = [
  // Send the origin to other sites and nothing at all on downgrade, so query
  // strings never travel off-site.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Registration pages are meant to be linked, not embedded — framing them is
  // only useful for clickjacking a sign-up.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Opt out of APIs the product never uses, so a future dependency can't start
  // asking for them.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  // Ignored over plain HTTP, so it is safe to send in development too.
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

/**
 * Content Security Policy.
 *
 * `'unsafe-inline'` for styles is required by Tailwind's runtime style
 * injection, and scripts need it for Next's inline bootstrap and the pre-paint
 * theme script. Tightening those needs nonces threaded through the framework,
 * which is a larger change than this pass — recorded in docs/AUDIT-FINDINGS.md.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // The app talks only to its own origin; email goes out server-side.
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          ...securityHeaders,
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
        ],
      },
    ];
  },
};

export default nextConfig;
