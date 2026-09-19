import { test } from "node:test";
import assert from "node:assert/strict";

const { eventInputFromJson } = await import("../.test-build/lib/event-input.js");

/**
 * One schema serves a form and a JSON API, so this adapter is the join between
 * them. It has no output of its own to inspect — a mistake here surfaces as the
 * wrong validation message, or worse as a field silently cleared, which is why
 * the conversions are pinned rather than eyeballed.
 */

const base = {
  title: "Autumn Workshop",
  startsAt: "2026-11-05T18:30",
  timezone: "Asia/Manila",
};

test("a number capacity becomes text for the form's parser", () => {
  // The schema parses capacity from text, so this is what keeps "Capacity must
  // be a whole number above zero." the answer on both front ends.
  assert.equal(eventInputFromJson({ ...base, capacity: 50 }).capacity, "50");
  // Zero must reach the schema to be rejected, not vanish as falsy.
  assert.equal(eventInputFromJson({ ...base, capacity: 0 }).capacity, "0");
  assert.equal(eventInputFromJson({ ...base, capacity: -3 }).capacity, "-3");
});

test("null capacity means unlimited, not a validation failure", () => {
  assert.equal(eventInputFromJson({ ...base, capacity: null }).capacity, undefined);
  assert.equal(eventInputFromJson(base).capacity, undefined);
});

test("JSON nulls become the undefined the schema's optionals expect", () => {
  const adapted = eventInputFromJson({
    ...base,
    slug: null,
    description: null,
    endsAt: null,
  });
  assert.equal(adapted.slug, undefined);
  assert.equal(adapted.description, undefined);
  assert.equal(adapted.endsAt, undefined);
});

test("absent optional fields stay absent", () => {
  const adapted = eventInputFromJson(base);
  assert.equal(adapted.slug, undefined);
  assert.equal(adapted.description, undefined);
  assert.equal(adapted.endsAt, undefined);
});

test("a missing timezone is left for the schema to default", () => {
  assert.equal(eventInputFromJson(base).timezone, "Asia/Manila");
  assert.equal(eventInputFromJson({ title: "x", startsAt: "y" }).timezone, undefined);
});

test("waitlistEnabled passes through, defaulting to off", () => {
  assert.equal(eventInputFromJson({ ...base, waitlistEnabled: true }).waitlistEnabled, true);
  // Must survive as false rather than becoming the default by being falsy.
  assert.equal(eventInputFromJson({ ...base, waitlistEnabled: false }).waitlistEnabled, false);
  assert.equal(eventInputFromJson(base).waitlistEnabled, false);
});

test("values that are meant to be carried are not touched", () => {
  const adapted = eventInputFromJson({
    ...base,
    slug: "autumn-workshop",
    description: "An evening session.",
    endsAt: "2026-11-05T21:00",
  });
  assert.equal(adapted.title, "Autumn Workshop");
  assert.equal(adapted.slug, "autumn-workshop");
  assert.equal(adapted.description, "An evening session.");
  assert.equal(adapted.startsAt, "2026-11-05T18:30");
  assert.equal(adapted.endsAt, "2026-11-05T21:00");
});
