import { test } from "node:test";
import assert from "node:assert/strict";

import { escapeCsvCell, toCsv, filenameSlug } from "../.test-build/lib/csv.js";

/**
 * Attendee names and emails come from the public and land in a file an
 * organizer opens in a spreadsheet. This escaping is a security control, so it
 * gets tested against the payloads it exists to stop.
 */

test("neutralises formula triggers", () => {
  const payloads = [
    ["=cmd|'/c calc'!A1", "'=cmd|'/c calc'!A1"],
    ["+1-555-0100", "'+1-555-0100"],
    ["-2+3", "'-2+3"],
    ["@SUM(A1:A9)", "'@SUM(A1:A9)"],
    ["\tstartswithtab", "'\tstartswithtab"],
  ];

  for (const [input, expected] of payloads) {
    assert.equal(escapeCsvCell(input), expected, input);
  }
});

test("leaves ordinary values alone", () => {
  assert.equal(escapeCsvCell("Priya Raman"), "Priya Raman");
  assert.equal(escapeCsvCell("priya@example.com"), "priya@example.com");
  assert.equal(escapeCsvCell(""), "");
  assert.equal(escapeCsvCell(null), "");
  assert.equal(escapeCsvCell(undefined), "");
});

test("quotes values containing delimiters, quotes or newlines", () => {
  assert.equal(escapeCsvCell('Quote "Quinn", Jr'), '"Quote ""Quinn"", Jr"');
  assert.equal(escapeCsvCell("line one\nline two"), '"line one\nline two"');
  assert.equal(escapeCsvCell("a,b"), '"a,b"');
});

test("applies both treatments in the right order", () => {
  // Needs the apostrophe *and* quoting. Escaping in the wrong order would
  // either lose the guard or double-quote incorrectly.
  assert.equal(escapeCsvCell('=cmd|x,y"z'), `"'=cmd|x,y""z"`);
});

test("builds a well-formed document", () => {
  const csv = toCsv(
    ["Name", "Email"],
    [
      ["Priya Raman", "priya@example.com"],
      ["=danger", "x@example.com"],
    ],
  );

  assert.equal(
    csv,
    "Name,Email\r\nPriya Raman,priya@example.com\r\n'=danger,x@example.com\r\n",
  );
});

test("produces safe filenames", () => {
  assert.equal(filenameSlug("Acme Summer Meetup"), "acme-summer-meetup");
  assert.equal(filenameSlug("../../etc/passwd"), "etc-passwd");
  assert.equal(filenameSlug(""), "export");
  assert.equal(filenameSlug("!!!"), "export");
});
