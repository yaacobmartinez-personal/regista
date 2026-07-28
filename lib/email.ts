/**
 * Minimal transactional-email seam.
 *
 * M5 swaps the transport for Resend + React Email templates; until then (and
 * whenever RESEND_API_KEY is absent) messages are logged to the server console
 * so local flows are fully testable without a provider.
 */

export type EmailMessage = {
  to: string;
  subject: string;
  /** Plain-text body. Rich templates arrive with React Email in M5. */
  text: string;
};

export async function sendEmail({ to, subject, text }: EmailMessage): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    // Dev fallback. Never log tokens in production paths — this branch only runs
    // when no provider is configured.
    console.log(
      [
        "",
        "──────────── email (dev console transport) ────────────",
        `To:      ${to}`,
        `Subject: ${subject}`,
        "",
        text,
        "───────────────────────────────────────────────────────",
        "",
      ].join("\n"),
    );
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "Regista <no-reply@regista.app>",
      to,
      subject,
      text,
    }),
  });

  if (!res.ok) {
    // Surface failure to the caller without leaking recipient details upstream.
    throw new Error(`Email send failed (${res.status})`);
  }
}
