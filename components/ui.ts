/**
 * Shared class strings for the handful of controls this product uses.
 *
 * These were copy-pasted: the input string appeared verbatim in six files, the
 * primary button in six, the outline button in about ten — and only some copies
 * carried a focus ring, so keyboard focus looked different depending on which
 * page you were on. Having one definition each is mostly about that
 * consistency; the deduplication is a side effect.
 *
 * Plain strings rather than components, so they compose with page-specific
 * classes without a wrapper for every variation.
 */

/** Every interactive element gets the same visible focus treatment. */
export const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30";

const focusRingStrong =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";

export const fieldClass =
  `rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm placeholder:text-faint focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25`;

export const buttonPrimary =
  `rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-60 ${focusRingStrong}`;

export const buttonSecondary =
  `rounded-lg border border-line-strong px-4 py-2.5 text-sm font-medium transition-colors hover:bg-panel disabled:opacity-60 ${focusRing}`;

/** Compact variant for controls that sit inside table rows. */
export const buttonSmall =
  `rounded-lg border border-line-strong px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-panel ${focusRing}`;

export const buttonDanger =
  `rounded-lg bg-danger px-2.5 py-1.5 text-xs font-semibold text-surface transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40`;

export const errorText = "text-xs text-danger";
