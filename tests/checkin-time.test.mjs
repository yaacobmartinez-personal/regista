import { test } from "node:test";
import assert from "node:assert/strict";

const { resolveDoorTime, CLOCK_SKEW_TOLERANCE_MS } = await import(
  "../.test-build/lib/checkin-time.js"
);

/**
 * A check-in taken with no signal carries the phone's clock, and it is replayed
 * long afterwards. These are the bounds that decide when to believe it — the one
 * piece of the offline door that cannot be observed from the outside, because a
 * wrong answer looks like a plausible timestamp.
 */

const SIGNUP = Date.parse("2026-09-01T10:00:00.000Z");
const NOW = Date.parse("2026-09-01T18:00:00.000Z");
const bounds = { createdAtMs: SIGNUP, nowMs: NOW };

test("a real door time between signup and now is kept exactly", () => {
  // The whole point: a queue drained an hour later must not relabel the door.
  const door = Date.parse("2026-09-01T17:30:00.000Z");
  assert.deepEqual(resolveDoorTime(door, bounds), { ok: true, atMs: door });
});

test("earlier than signing up is pulled up to signup", () => {
  // Nobody arrives before they registered, so this is a wrong clock.
  const result = resolveDoorTime(Date.parse("2020-01-01T00:00:00.000Z"), bounds);
  assert.deepEqual(result, { ok: true, atMs: SIGNUP });
});

test("a clock a little fast is treated as now, not refused", () => {
  // Refusing this would push a legitimate check-in into the attention list.
  const slightlyAhead = NOW + 2000;
  assert.deepEqual(resolveDoorTime(slightlyAhead, bounds), { ok: true, atMs: NOW });
});

test("the whole tolerance window is still accepted", () => {
  const edge = NOW + CLOCK_SKEW_TOLERANCE_MS;
  assert.deepEqual(resolveDoorTime(edge, bounds), { ok: true, atMs: NOW });
});

test("beyond the tolerance it is refused rather than clamped", () => {
  const tooFar = NOW + CLOCK_SKEW_TOLERANCE_MS + 1;
  assert.deepEqual(resolveDoorTime(tooFar, bounds), { ok: false, reason: "future" });
  assert.deepEqual(
    resolveDoorTime(Date.parse("2026-09-08T00:00:00.000Z"), bounds),
    { ok: false, reason: "future" },
  );
});

test("the boundary instants themselves are kept", () => {
  assert.deepEqual(resolveDoorTime(SIGNUP, bounds), { ok: true, atMs: SIGNUP });
  assert.deepEqual(resolveDoorTime(NOW, bounds), { ok: true, atMs: NOW });
});

test("the tolerance is overridable, so the policy is not baked into callers", () => {
  assert.deepEqual(resolveDoorTime(NOW + 5000, bounds, 1000), {
    ok: false,
    reason: "future",
  });
});
