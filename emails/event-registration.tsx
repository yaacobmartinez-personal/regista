import { Link, Text } from "@react-email/components";
import { EmailLayout, brand, detailBox, paragraph } from "./layout";

export type EventRegistrationProps = {
  attendeeName: string;
  eventTitle: string;
  /** Already formatted in the event's own timezone, zone label included. */
  eventWhen: string;
  organizationName: string;
  eventUrl: string;
  /** Their own place — view it or give it up, without an account. */
  manageUrl: string;
  waitlisted: boolean;
};

export function EventRegistration({
  attendeeName,
  eventTitle,
  eventWhen,
  organizationName,
  eventUrl,
  manageUrl,
  waitlisted,
}: EventRegistrationProps) {
  return (
    <EmailLayout
      preview={
        waitlisted
          ? `You're on the waitlist for ${eventTitle}`
          : `You're registered for ${eventTitle}`
      }
      heading={waitlisted ? "You're on the waitlist" : "You're registered"}
      footerNote={`Sent by ${organizationName} using Regista.`}
    >
      <Text style={paragraph}>
        Hi {attendeeName},{" "}
        {waitlisted
          ? `${eventTitle} is full at the moment, so you've been added to the waitlist. We'll email you if a place opens up.`
          : `you have a place at ${eventTitle}.`}
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
                Event
              </Text>
              <Text
                style={{
                  color: brand.text,
                  fontSize: "16px",
                  fontWeight: 600,
                  margin: "4px 0 0",
                }}
              >
                {eventTitle}
              </Text>
              <Text style={{ color: brand.muted, fontSize: "14px", margin: "8px 0 0" }}>
                {eventWhen}
              </Text>
              <Text style={{ color: brand.muted, fontSize: "14px", margin: "4px 0 0" }}>
                Hosted by {organizationName}
              </Text>
            </td>
          </tr>
        </tbody>
      </table>

      <Text style={{ ...paragraph, fontSize: "13px" }}>
        Event page:{" "}
        <Link href={eventUrl} style={{ color: brand.accent, wordBreak: "break-all" }}>
          {eventUrl}
        </Link>
      </Text>

      <Text style={{ ...paragraph, fontSize: "13px" }}>
        {waitlisted ? "Your place on the waitlist" : "Your place"}:{" "}
        <Link href={manageUrl} style={{ color: brand.accent, wordBreak: "break-all" }}>
          {manageUrl}
        </Link>
      </Text>

      <Text style={{ ...paragraph, color: brand.muted, fontSize: "13px" }}>
        {waitlisted
          ? "Use that link to give up your place if you can no longer come. "
          : "That page also holds your check-in code for the day — show it at the door. Use the link to give up your place if you can no longer come. "}
        Keep it to yourself — anyone who has it can cancel for you. For anything
        else, reply to {organizationName}; they manage this guest list.
      </Text>
    </EmailLayout>
  );
}

/** Plain-text alternative, for clients that don't render HTML. */
export function eventRegistrationText({
  attendeeName,
  eventTitle,
  eventWhen,
  organizationName,
  eventUrl,
  manageUrl,
  waitlisted,
}: EventRegistrationProps): string {
  return [
    waitlisted ? `You're on the waitlist` : `You're registered`,
    ``,
    `Hi ${attendeeName},`,
    waitlisted
      ? `${eventTitle} is full at the moment, so you've been added to the waitlist.`
      : `You have a place at ${eventTitle}.`,
    ``,
    `Event:  ${eventTitle}`,
    `When:   ${eventWhen}`,
    `Host:   ${organizationName}`,
    `Page:   ${eventUrl}`,
    ``,
    `Your place: ${manageUrl}`,
    ``,
    waitlisted
      ? `Use that link to give up your place if you can no longer come.`
      : `That page also holds your check-in code for the day — show it at the door.\nUse the link to give up your place if you can no longer come.`,
    `Keep it to yourself — anyone who has it can cancel for you. For anything else,`,
    `reply to ${organizationName}; they manage this guest list.`,
  ].join("\n");
}
