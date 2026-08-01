import { test } from "node:test";
import assert from "node:assert/strict";

import {
  zonedInputToUtc,
  utcToZonedInput,
  wallClockExists,
  formatEventWhen,
  isValidTimeZone,
} from "../.test-build/lib/time.js";

/**
 * Timezone handling is the most intricate logic in the codebase and it fails
 * silently — a wrong offset just puts the event at the wrong time for everyone.
 * These cases are the ones that were actually broken at some point.
 */

test("converts a wall-clock time to the right instant", () => {
  const cases = [
    ["2026-09-15T18:00", "Asia/Manila", "2026-09-15T10:00:00.000Z"],
    ["2026-09-15T18:00", "Europe/London", "2026-09-15T17:00:00.000Z"], // BST
    ["2026-01-15T18:00", "Europe/London", "2026-01-15T18:00:00.000Z"], // GMT
    ["2026-09-15T18:00", "America/New_York", "2026-09-15T22:00:00.000Z"], // EDT
    ["2026-12-15T18:00", "America/New_York", "2026-12-15T23:00:00.000Z"], // EST
    ["2026-06-01T12:00", "UTC", "2026-06-01T12:00:00.000Z"],
  ];

  for (const [input, zone, expected] of cases) {
    assert.equal(
      zonedInputToUtc(input, zone).toISOString(),
      expected,
      `${input} in ${zone}`,
    );
  }
});

test("round-trips through every offset shape, including half and quarter hours", () => {
  const zones = [
    "UTC",
    "Asia/Manila",
    "Europe/London",
    "America/New_York",
    "America/Santiago",
    "Australia/Sydney",
    "Asia/Kolkata", // +05:30
    "Australia/Lord_Howe", // +10:30 / +11
    "Pacific/Chatham", // +12:45 / +13:45
  ];
  const times = ["2026-01-15T09:30", "2026-06-21T23:45", "2026-11-02T00:15"];

  for (const zone of zones) {
    for (const input of times) {
      assert.equal(
        utcToZonedInput(zonedInputToUtc(input, zone), zone),
        input,
        `${input} in ${zone} should survive a round trip`,
      );
    }
  }
});

test("rejects wall-clock times that do not exist", () => {
  // The hour skipped when clocks go forward. Converting these anyway used to
  // move the event silently — an hour *earlier* in the Americas, and to the
  // previous day in Santiago.
  const gaps = [
    ["2026-03-08T02:30", "America/New_York"],
    ["2026-03-29T01:30", "Europe/London"],
    ["2026-09-06T00:30", "America/Santiago"],
  ];

  for (const [input, zone] of gaps) {
    assert.equal(wallClockExists(input, zone), false, `${input} in ${zone}`);
  }
});

test("accepts real times, including ones that happen twice", () => {
  const real = [
    ["2026-03-08T03:30", "America/New_York"], // just after the gap
    ["2026-09-15T18:00", "America/New_York"], // ordinary
    ["2026-10-25T01:30", "Europe/London"], // ambiguous: occurs twice, but exists
  ];

  for (const [input, zone] of real) {
    assert.equal(wallClockExists(input, zone), true, `${input} in ${zone}`);
  }
});

test("formats an event in its own zone, not the machine's", () => {
  const startsAt = new Date("2026-09-15T22:00:00.000Z");
  const formatted = formatEventWhen(startsAt, null, "America/New_York");

  // 22:00Z is 18:00 in New York; the zone must be named so it isn't ambiguous.
  assert.match(formatted, /18:00/);
  assert.match(formatted, /15 September 2026/);
  assert.match(formatted, /GMT-4|EDT/);
});

test("recognises valid and invalid zone names", () => {
  assert.equal(isValidTimeZone("Europe/London"), true);
  assert.equal(isValidTimeZone("UTC"), true);
  assert.equal(isValidTimeZone("Not/AZone"), false);
  assert.equal(isValidTimeZone(""), false);
});
