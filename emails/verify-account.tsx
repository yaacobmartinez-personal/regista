import { Button, Link, Text } from "@react-email/components";
import { EmailLayout, brand, paragraph } from "./layout";

/**
 * Confirm the address on a personal account.
 *
 * Separate from `verify-email.tsx`, which confirms the owner of a new
 * organization and talks about activating it. Someone who signed up in the app
 * to attend events has no organization, and telling them one is about to go
 * live would be both confusing and untrue.
 */

export type VerifyAccountProps = {
  name: string | null;
  verifyUrl: string;
  expiryHours: number;
};

export function VerifyAccount({ name, verifyUrl, expiryHours }: VerifyAccountProps) {
  return (
    <EmailLayout preview="Confirm your email to finish setting up Thingstead" heading="Confirm your email">
      <Text style={paragraph}>
        {name ? `Hi ${name}, ` : ""}confirm this address to finish setting up your
        Thingstead account. You&rsquo;ll be able to sign up for events and keep your
        tickets in one place.
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
        Confirm my email
      </Button>

      <Text style={{ ...paragraph, fontSize: "13px", margin: "20px 0 0" }}>
        Or paste this into your browser:
        <br />
        <Link href={verifyUrl} style={{ color: brand.accent, wordBreak: "break-all" }}>
          {verifyUrl}
        </Link>
      </Text>

      <Text style={{ ...paragraph, fontSize: "13px" }}>
        {`The link works once and expires in ${expiryHours} hours. If you didn't create an account, you can ignore this email — nothing will be set up.`}
      </Text>
    </EmailLayout>
  );
}

/** Plain-text alternative, for clients that don't render HTML. */
export function verifyAccountText({ name, verifyUrl, expiryHours }: VerifyAccountProps): string {
  return [
    `Confirm your email`,
    ``,
    `${name ? `Hi ${name}, c` : "C"}onfirm this address to finish setting up your`,
    `Thingstead account. You'll be able to sign up for events and keep your`,
    `tickets in one place.`,
    ``,
    verifyUrl,
    ``,
    `The link works once and expires in ${expiryHours} hours. If you didn't`,
    `create an account, you can ignore this email — nothing will be set up.`,
  ].join("\n");
}
