import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";

/**
 * Shared shell for every message we send.
 *
 * Email clients ignore most stylesheets, so everything is inline and the layout
 * stays simple. Deliberately light-only: dark-mode handling across clients is
 * inconsistent enough that forcing one palette is more predictable than a theme
 * that half-applies.
 */

export const brand = {
  accent: "#3355e6",
  text: "#191c22",
  muted: "#616b7a",
  faint: "#8a93a1",
  border: "#e3e6eb",
  panel: "#f6f7f9",
  surface: "#ffffff",
  font: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
};

export function EmailLayout({
  preview,
  heading,
  children,
  footerNote,
}: {
  preview: string;
  heading: string;
  children: ReactNode;
  footerNote?: string;
}) {
  return (
    <Html lang="en">
      <Head />
      {/* Shown in the inbox list next to the subject. */}
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: brand.panel,
          fontFamily: brand.font,
          margin: 0,
          padding: "24px 0",
        }}
      >
        <Container
          style={{
            backgroundColor: brand.surface,
            border: `1px solid ${brand.border}`,
            borderRadius: "12px",
            margin: "0 auto",
            maxWidth: "560px",
            padding: "32px",
          }}
        >
          <Section>
            <table cellPadding={0} cellSpacing={0} role="presentation">
              <tbody>
                <tr>
                  <td
                    style={{
                      backgroundColor: brand.accent,
                      borderRadius: "7px",
                      color: "#ffffff",
                      fontSize: "14px",
                      fontWeight: 700,
                      height: "26px",
                      textAlign: "center",
                      width: "26px",
                    }}
                  >
                    T
                  </td>
                  <td style={{ paddingLeft: "8px" }}>
                    <Text
                      style={{
                        color: brand.text,
                        fontSize: "15px",
                        fontWeight: 600,
                        margin: 0,
                      }}
                    >
                      Thingstead
                    </Text>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Text
            style={{
              color: brand.text,
              fontSize: "22px",
              fontWeight: 600,
              lineHeight: "1.3",
              margin: "24px 0 0",
            }}
          >
            {heading}
          </Text>

          {children}

          <Hr style={{ borderColor: brand.border, margin: "28px 0 16px" }} />

          <Text style={{ color: brand.faint, fontSize: "12px", margin: 0 }}>
            {footerNote ?? "Sent by Thingstead, the event registration platform."}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export const paragraph = {
  color: brand.muted,
  fontSize: "15px",
  lineHeight: "1.6",
  margin: "16px 0 0",
};

export const detailBox = {
  backgroundColor: brand.panel,
  border: `1px solid ${brand.border}`,
  borderRadius: "10px",
  margin: "20px 0 0",
  padding: "16px 18px",
};
