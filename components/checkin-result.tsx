import type { CheckInOutcome } from "@/lib/checkin";

/** The visible result of a check-in, shared by the scanner and the QR landing so
 *  a given outcome always reads and colours the same way. Colour carries meaning,
 *  but so do the words — never colour alone. */

export type CheckInBannerProps = {
  outcome: CheckInOutcome;
  name?: string | null;
  /** ISO time they were checked in — shown for "checked_in" and "already". */
  atIso?: string | null;
  /** For "wrong_event": the event the ticket actually belongs to. */
  eventTitle?: string | null;
};

type Tone = "ok" | "warn" | "bad";

const toneClass: Record<Tone, string> = {
  ok: "border-success/30 bg-success-bg text-success",
  warn: "border-line-strong bg-panel text-fg",
  bad: "border-danger/30 bg-danger/10 text-danger",
};

function present(props: CheckInBannerProps): { tone: Tone; title: string; detail: string } {
  const who = props.name ?? "This attendee";
  const time = props.atIso
    ? new Date(props.atIso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;
  switch (props.outcome) {
    case "checked_in":
      return { tone: "ok", title: "Checked in", detail: who };
    case "already":
      return {
        tone: "warn",
        title: "Already checked in",
        detail: time ? `${who} · at ${time}` : who,
      };
    case "waitlist":
      return { tone: "warn", title: "On the waitlist", detail: `${who} — not a confirmed place` };
    case "cancelled":
      return { tone: "bad", title: "Cancelled place", detail: `${who} gave this place up` };
    case "wrong_event":
      return {
        tone: "bad",
        title: "Wrong event",
        detail: props.eventTitle ? `Ticket is for ${props.eventTitle}` : "Different event",
      };
    default:
      return { tone: "bad", title: "Not recognised", detail: "No matching ticket" };
  }
}

export function CheckInBanner(props: CheckInBannerProps) {
  const { tone, title, detail } = present(props);
  return (
    <div className={`rounded-xl border p-5 text-center ${toneClass[tone]}`} aria-live="polite">
      <p className="text-base font-semibold">{title}</p>
      <p className="mt-1 text-sm opacity-90">{detail}</p>
    </div>
  );
}
