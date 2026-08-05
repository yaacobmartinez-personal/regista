import { Button, Link, Text } from "@react-email/components";
import { EmailLayout, brand, detailBox, paragraph } from "./layout";

export type TeamInviteProps = {
  organizationName: string;
  /** "an admin" / "a staff member" — describes what they'll be able to do. */
  roleLabel: string;
  roleSummary: string;
  inviterName: string;
  inviteUrl: string;
  expiryDays: number;
};

export function TeamInvite({
  organizationName,
  roleLabel,
  roleSummary,
  inviterName,
  inviteUrl,
  expiryDays,
}: TeamInviteProps) {
  return (
    <EmailLayout
      preview={`${inviterName} invited you to help run ${organizationName}`}
      heading={`Join ${organizationName}`}
    >
      <Text style={paragraph}>
        {`${inviterName} invited you to help run events for `}
        <strong style={{ color: brand.text }}>{organizationName}</strong>
        {` on Thingstead.`}
      </Text>

      <table cellPadding={0} cellSpacing={0} role="presentation" style={detailBox} width="100%">
        <tbody>
          <tr>
            <td>
              <Text
                style={{
                  color: brand.faint,
                  fontSize: "11px",
                  letterSpacing: "0.08em",
                  margin: 0,
                  textTransform: "uppercase",
                }}
              >
                Your role
              </Text>
              <Text
                style={{
                  color: brand.text,
                  fontSize: "16px",
                  fontWeight: 600,
                  margin: "4px 0 0",
                }}
              >
                {roleLabel}
              </Text>
              <Text style={{ color: brand.muted, fontSize: "14px", margin: "8px 0 0" }}>
                {roleSummary}
              </Text>
            </td>
          </tr>
        </tbody>
      </table>

      <Button
        href={inviteUrl}
        style={{
          backgroundColor: brand.accent,
          borderRadius: "8px",
          color: "#ffffff",
          display: "inline-block",
          fontSize: "15px",
          fontWeight: 600,
          margin: "24px 0 0",
          padding: "12px 20px",
          textDecoration: "none",
        }}
      >
        Accept invitation
      </Button>

      <Text style={{ ...paragraph, fontSize: "13px", margin: "20px 0 0" }}>
        Or paste this into your browser:
        <br />
        <Link href={inviteUrl} style={{ color: brand.accent, wordBreak: "break-all" }}>
          {inviteUrl}
        </Link>
      </Text>

      <Text style={{ ...paragraph, fontSize: "13px" }}>
        {`This invitation is for this email address only, works once, and expires in ${expiryDays} days. If you weren't expecting it, you can ignore this email.`}
      </Text>
    </EmailLayout>
  );
}

/** Plain-text alternative, for clients that don't render HTML. */
export function teamInviteText({
  organizationName,
  roleLabel,
  roleSummary,
  inviterName,
  inviteUrl,
  expiryDays,
}: TeamInviteProps): string {
  return [
    `Join ${organizationName}`,
    ``,
    `${inviterName} invited you to help run events for ${organizationName} on Thingstead.`,
    ``,
    `Your role: ${roleLabel}`,
    `${roleSummary}`,
    ``,
    inviteUrl,
    ``,
    `This invitation is for this email address only, works once, and expires in`,
    `${expiryDays} days. If you weren't expecting it, you can ignore this email.`,
  ].join("\n");
}
