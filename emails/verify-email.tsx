import { Button, Link, Text } from "@react-email/components";
import { EmailLayout, brand, paragraph } from "./layout";

export type VerifyEmailProps = {
  organizationName: string;
  address: string;
  verifyUrl: string;
  expiryHours: number;
};

export function VerifyEmail({
  organizationName,
  address,
  verifyUrl,
  expiryHours,
}: VerifyEmailProps) {
  return (
    <EmailLayout
      preview={`Confirm your email to activate ${organizationName}`}
      heading="Confirm your email"
    >
      <Text style={paragraph}>
        You created <strong style={{ color: brand.text }}>{organizationName}</strong> on
        Regista. Confirm this address and your registration pages go live at{" "}
        <strong style={{ color: brand.text }}>{address}</strong>.
      </Text>

      <Button
        href={verifyUrl}
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
        Confirm and activate
      </Button>

      <Text style={{ ...paragraph, fontSize: "13px", margin: "20px 0 0" }}>
        Or paste this into your browser:
        <br />
        <Link href={verifyUrl} style={{ color: brand.accent, wordBreak: "break-all" }}>
          {verifyUrl}
        </Link>
      </Text>

      <Text style={{ ...paragraph, fontSize: "13px" }}>
        {`The link works once and expires in ${expiryHours} hours. If you didn't create this organization, you can ignore this email — nothing will be activated.`}
      </Text>
    </EmailLayout>
  );
}

/** Plain-text alternative, for clients that don't render HTML. */
export function verifyEmailText({
  organizationName,
  address,
  verifyUrl,
  expiryHours,
}: VerifyEmailProps): string {
  return [
    `Confirm your email`,
    ``,
    `You created "${organizationName}" on Regista. Confirm this address and your`,
    `registration pages go live at ${address}.`,
    ``,
    verifyUrl,
    ``,
    `The link works once and expires in ${expiryHours} hours.`,
    `If you didn't create this organization, you can ignore this email.`,
  ].join("\n");
}
