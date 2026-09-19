/**
 * Reconciling a door clock with ours.
 *
 * When the app checks someone in with no signal, the only record of when it
 * happened is the phone's clock, and it is replayed minutes or hours later.
 * Taking the replay's arrival time instead would record the whole door as having
 * arrived at once; taking the phone's word for it without bounds would let a
 * wrong clock write a check-in into next week. This is the policy in between,
 * kept apart from the route so it can be tested on its own.
 */

/**
 * How far ahead of the server a client's clock may be before its timestamp is
 * refused rather than trusted.
 *
 * A phone will not agree with the server to the second. Rejecting anything even
 * slightly ahead would push legitimate door check-ins into the app's "needs
 * attention" list for no reason, so inside this window the value is treated as
 * "now"; beyond it, the clock is wrong enough that the claim is refused.
 */
export const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

export type DoorTime =
  | { ok: true; atMs: number }
  /** Too far ahead to be a clock difference — the caller answers 400. */
  | { ok: false; reason: "future" };

/**
 * Further ahead than a clock difference explains.
 *
 * Separated from the clamp below because the two halves are needed in different
 * places: a route can refuse an impossible time knowing only the clock, while
 * pulling a plausible one into range needs the registration it belongs to.
 */
export function isImpossiblyAhead(
  claimedMs: number,
  nowMs: number,
  toleranceMs: number = CLOCK_SKEW_TOLERANCE_MS,
): boolean {
  return claimedMs > nowMs + toleranceMs;
}

/**
 * Pull a claimed time into the window where it could have happened.
 *
 * Nobody arrives before they signed up, and nothing happens later than now, so a
 * value outside those bounds is a wrong clock rather than a fact — it is pulled
 * to the nearest end rather than stored as given.
 */
export function clampDoorTime(
  claimedMs: number,
  bounds: { createdAtMs: number; nowMs: number },
): number {
  return Math.min(Math.max(claimedMs, bounds.createdAtMs), bounds.nowMs);
}

/**
 * Both at once: refuse an impossible time, bound a plausible one.
 *
 * What the manual check-in does in a single step, since it has the registration
 * in hand before it has to decide.
 */
export function resolveDoorTime(
  claimedMs: number,
  bounds: { createdAtMs: number; nowMs: number },
  toleranceMs: number = CLOCK_SKEW_TOLERANCE_MS,
): DoorTime {
  if (isImpossiblyAhead(claimedMs, bounds.nowMs, toleranceMs)) {
    return { ok: false, reason: "future" };
  }
  return { ok: true, atMs: clampDoorTime(claimedMs, bounds) };
}
