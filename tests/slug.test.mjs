import { test } from "node:test";
import assert from "node:assert/strict";

import {
  slugify,
  isUsableSlug,
  isValidSlugShape,
  isReservedSubdomain,
} from "../.test-build/lib/slug.js";

/**
 * The browser previews the address a user is about to get; the server decides
 * what they actually get. These were separate copies of the same code, so a
 * change to one could make the preview a lie. They are one module now — this
 * covers the behaviour both sides depend on.
 */

test("turns free text into a usable segment", () => {
  const cases = [
    ["Acme Events", "acme-events"],
    ["  Padded  Name  ", "padded-name"],
    ["Mixed CASE Name", "mixed-case-name"],
    ["Punctuation!? Removed.", "punctuation-removed"],
    ["multiple   spaces", "multiple-spaces"],
    ["already-hyphenated", "already-hyphenated"],
    ["collapse---hyphens", "collapse-hyphens"],
    // Accented characters are dropped rather than transliterated, so a name
    // written in them can collapse to something unrecognisable. That is worth
    // knowing about: the availability check will usually reject the result for
    // being too short, but "Ünïcödé Çafé" quietly becomes this.
    ["Ünïcödé Çafé", "ncd-af"],
    ["🎉 Party 🎉", "party"],
  ];

  for (const [input, expected] of cases) {
    assert.equal(slugify(input), expected, input);
  }
});

test("never exceeds the length the database allows", () => {
  const long = "a".repeat(200);
  assert.equal(slugify(long).length, 63);
});

test("accepts shapes the address rules allow", () => {
  for (const slug of ["acme", "acme-events", "a1b2", "x".repeat(63)]) {
    assert.equal(isValidSlugShape(slug), true, slug);
  }
});

test("rejects shapes that would not work as a subdomain", () => {
  const bad = [
    "", // empty
    "ab", // too short
    "-leading", // leading hyphen
    "trailing-", // trailing hyphen
    "has space",
    "UPPER",
    "under_score",
    "x".repeat(64), // too long
  ];

  for (const slug of bad) {
    assert.equal(isValidSlugShape(slug), false, JSON.stringify(slug));
  }
});

test("reserves the names that would shadow a first-party surface", () => {
  // `home`, `app` and `api` are the top-level route folders. A tenant claiming
  // one of these would have its subdomain rewritten into our own pages —
  // `home` in particular would serve the marketing site and signup form from
  // what looks like a customer's address.
  for (const slug of ["home", "app", "api", "www", "admin", "login"]) {
    assert.equal(isReservedSubdomain(slug), true, slug);
    assert.equal(isUsableSlug(slug), false, slug);
  }
});

test("a slug is usable only when it is both well-formed and unreserved", () => {
  assert.equal(isUsableSlug("acme"), true);
  assert.equal(isUsableSlug("home"), false); // reserved
  assert.equal(isUsableSlug("ab"), false); // too short
});

test("a slugified organization name is usable, or clearly is not", () => {
  // What the signup form does: derive from the typed name, then check it.
  // Anything that slugifies to fewer than three characters must be caught by
  // the check rather than accepted and failing later.
  assert.equal(isUsableSlug(slugify("Acme Events")), true);
  assert.equal(isUsableSlug(slugify("A")), false);
  assert.equal(isUsableSlug(slugify("🎉")), false);
});
