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
};

export async function sendEmail({ to, subject, html, text }: EmailMessage): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log(
      [
        "",
        "──────────── email (dev console transport) ────────────",
        `To:      ${to}`,
        `Subject: ${subject}`,
        "",
        text,
        "",
        `[html alternative: ${html.length} bytes]`,
        process.env.EMAIL_DEBUG_HTML ? `\n${html}` : "",
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
}): Promise<void> {
  const html = await render(options.template);
  await sendEmail({
    to: options.to,
    subject: options.subject,
    html,
    text: options.text,
  });
}
