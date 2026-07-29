/**
 * Timezone handling for event times.
 *
 * An event happens in a place, so each event carries an IANA timezone. Instants
 * are stored in UTC; the zone decides how a wall-clock time entered by the
 * organizer maps to an instant, and how everyone sees it afterwards. Without
 * this, the same event renders at different times for organizer and attendee.
 */

/** Milliseconds to add to a UTC instant to get wall-clock time in `timeZone`. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);

  const wallClockAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return wallClockAsUtc - instant.getTime();
}

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert a `datetime-local` value ("YYYY-MM-DDTHH:mm") interpreted in
 * `timeZone` into the corresponding UTC instant.
 */
export function zonedInputToUtc(input: string, timeZone: string): Date {
  const normalized = input.length === 16 ? `${input}:00` : input;
  const naive = new Date(`${normalized}Z`);
  if (Number.isNaN(naive.getTime())) return naive;

  // First pass uses the offset at the naive instant; the second corrects for
  // cases where that lands on the other side of a DST transition.
  const firstPass = new Date(naive.getTime() - zoneOffsetMs(naive, timeZone));
  return new Date(naive.getTime() - zoneOffsetMs(firstPass, timeZone));
}

/** Render a UTC instant as a `datetime-local` value in `timeZone`. */
export function utcToZonedInput(date: Date, timeZone: string): string {
  const shifted = new Date(date.getTime() + zoneOffsetMs(date, timeZone));
  return shifted.toISOString().slice(0, 16);
}

/** Format an instant in the event's own timezone. */
export function formatInZone(
  date: Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone }).format(date);
}

/** Short zone label for display, e.g. "GMT+8". */
export function zoneLabel(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    timeZoneName: "short",
  }).formatToParts(date);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
}

/**
 * The canonical way to present an event's date and time.
 *
 * Shared by the public page and the confirmation email so the two can never
 * disagree about when something happens.
 */
export function formatEventWhen(
  startsAt: Date,
  endsAt: Date | null,
  timezone: string,
): string {
  const date = formatInZone(startsAt, timezone, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const start = formatInZone(startsAt, timezone, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const zone = zoneLabel(startsAt, timezone);
  if (!endsAt) return `${date} · ${start} ${zone}`;
  const end = formatInZone(endsAt, timezone, { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${start}–${end} ${zone}`;
}

/** The list offered in the event editor. */
export function supportedTimeZones(): string[] {
  const withValues = Intl as typeof Intl & {
    supportedValuesOf?: (key: string) => string[];
  };
  return withValues.supportedValuesOf?.("timeZone") ?? ["UTC"];
}
