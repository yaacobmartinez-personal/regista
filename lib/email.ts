import { render } from "@react-email/render";
import type { ReactElement } from "react";

/**
 * Transactional email.
 *
 * Messages are sent as HTML with a plain-text alternative, so clients that
 * refuse HTML still get something readable. With no RESEND_API_KEY configured
 * the text version is written to the server console instead, which keeps local
 * flows testable without a provider.
 */

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  /** Plain-text alternative. Also what dev logging prints. */
  text: string;
  /**
   * Where replies should go.
   *
   * Attendee mail tells people to reply to the organizer if they need their
   * details corrected or removed — which is the only route the product offers
   * them. Without this, that reply reaches a no-reply mailbox and the stated
   * channel doesn't exist.
   */
  replyTo?: string;
};

/**
 * Replace the secret in any link with a placeholder.
 *
 * Verification and invitation links carry a single-use bearer token. Printing
 * one to a log turns log-read access into account access, and it stays
 * replayable — which would defeat storing only hashes.
 */
function redactTokens(value: string): string {
  return value.replace(/([?&]token=)[^\s&"']+/gi, "$1[redacted]");
}

/** First tokenised link in a message, for the dev-only opt-in below. */
function extractLink(text: string): string | null {
  return text.match(/https?:\/\/\S*[?&]token=\S+/i)?.[0] ?? null;
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  replyTo,
}: EmailMessage): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const isProduction = process.env.NODE_ENV === "production";

  if (!apiKey) {
    // Never fall back to logging in production: a rotated or mistyped key would
    // silently turn every message into a log entry instead of failing loudly.
    if (isProduction) {
      throw new Error("RESEND_API_KEY is not configured; refusing to send email.");
    }

    console.log(
      [
        "",
        "──────────── email (dev console transport) ────────────",
        `To:      ${to}`,
        replyTo ? `Reply-To: ${replyTo}` : "",
        `Subject: ${subject}`,
        "",
        redactTokens(text),
        "",
        `[html alternative: ${html.length} bytes]`,
        // Printing the token is what makes a link usable from the console
        // during local work, so it is opt-in and dev-only.
        process.env.EMAIL_DEBUG_TOKENS ? `\nLink: ${extractLink(text) ?? "(none)"}` : "",
        process.env.EMAIL_DEBUG_HTML ? `\n${redactTokens(html)}` : "",
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
      html,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  if (!res.ok) {
    // Surface failure without echoing the recipient into the error.
    throw new Error(`Email send failed (${res.status})`);
  }
}

/** Render a template and send it in one step. */
export async function sendTemplate(options: {
  to: string;
  subject: string;
  template: ReactElement;
  text: string;
  replyTo?: string;
}): Promise<void> {
  const html = await render(options.template);
  await sendEmail({
    to: options.to,
    subject: options.subject,
    replyTo: options.replyTo,
    html,
    text: options.text,
  });
}
