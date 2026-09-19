import { Button, Link, Text } from "@react-email/components";
import { EmailLayout, brand, paragraph } from "./layout";

/**
 * A link to choose a new password.
 *
 * The closing line matters as much as the button: this message is the one thing
 * that reaches someone whose address was entered by a stranger, so it has to say
 * plainly that ignoring it leaves the account exactly as it was.
 */

export type ResetPasswordProps = {
  name: string | null;
  resetUrl: string;
  expiryHours: number;
};

export function ResetPassword({ name, resetUrl, expiryHours }: ResetPasswordProps) {
  return (
    <EmailLayout preview="Choose a new Thingstead password" heading="Choose a new password">
      <Text style={paragraph}>
        {name ? `Hi ${name}, s` : "S"}omeone asked to reset the password for the
        Thingstead account on this address. Use the link below to choose a new one.
      </Text>

      <Button
        href={resetUrl}
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
        Choose a new password
      </Button>

      <Text style={{ ...paragraph, fontSize: "13px", margin: "20px 0 0" }}>
        Or paste this into your browser:
        <br />
        <Link href={resetUrl} style={{ color: brand.accent, wordBreak: "break-all" }}>
          {resetUrl}
        </Link>
      </Text>

      <Text style={{ ...paragraph, fontSize: "13px" }}>
        {`The link works once and expires in ${expiryHours} hour${expiryHours === 1 ? "" : "s"}. If you didn't ask for this, you can ignore this email — your password stays as it is, and nobody has been given access.`}
      </Text>
    </EmailLayout>
  );
}

/** Plain-text alternative, for clients that don't render HTML. */
export function resetPasswordText({ name, resetUrl, expiryHours }: ResetPasswordProps): string {
  return [
    `Choose a new password`,
    ``,
    `${name ? `Hi ${name}, s` : "S"}omeone asked to reset the password for the`,
    `Thingstead account on this address. Use the link below to choose a new one.`,
    ``,
    resetUrl,
    ``,
    `The link works once and expires in ${expiryHours} hour${expiryHours === 1 ? "" : "s"}. If you didn't ask`,
    `for this, you can ignore this email — your password stays as it is, and`,
    `nobody has been given access.`,
  ].join("\n");
}
