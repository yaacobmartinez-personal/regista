/**
 * CSV serialisation for attendee exports.
 *
 * Attendee names and emails are supplied by the public, so a cell like
 * `=cmd|'/c calc'!A1` would execute as a formula when the file is opened in a
 * spreadsheet. Any cell beginning with a formula trigger is prefixed with an
 * apostrophe, which spreadsheets treat as "this is text".
 */

const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

export function escapeCsvCell(value: string | null | undefined): string {
  let cell = value ?? "";

  if (FORMULA_TRIGGER.test(cell)) cell = `'${cell}`;

  // Quote when the value contains a delimiter, quote, or newline.
  if (/[",\n\r]/.test(cell)) cell = `"${cell.replace(/"/g, '""')}"`;

  return cell;
}

export function toCsv(headers: string[], rows: (string | null | undefined)[][]): string {
  const lines = [headers.map(escapeCsvCell).join(",")];
  for (const row of rows) lines.push(row.map(escapeCsvCell).join(","));
  // CRLF keeps Excel happy; a trailing newline is conventional.
  return `${lines.join("\r\n")}\r\n`;
}

/** Safe filename segment for Content-Disposition. */
export function filenameSlug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "export"
  );
}
