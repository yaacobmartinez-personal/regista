import { test } from "node:test";
import assert from "node:assert/strict";

const { extractCheckInCode } = await import("../.test-build/lib/urls.js");

/**
 * One code has to arrive two ways: decoded from the QR, which yields the whole
 * check-in URL, or typed off a printed ticket, which yields the token alone.
 * Getting this wrong fails at a door with a queue behind it.
 */

test("passes a bare token through", () => {
  assert.equal(extractCheckInCode("abc123_-XY"), "abc123_-XY");
  assert.equal(extractCheckInCode("  abc123  "), "abc123");
});

test("pulls the token out of a scanned check-in URL", () => {
  assert.equal(
    extractCheckInCode("https://app.thingstead.pro/checkin?c=abc123"),
    "abc123",
  );
  // base64url tokens can contain - and _, and the URL carries them encoded.
  assert.equal(
    extractCheckInCode("https://app.thingstead.pro/checkin?c=a-b_c%3D"),
    "a-b_c=",
  );
  // Scheme case and extra query parameters must not matter.
  assert.equal(
    extractCheckInCode("HTTPS://app.thingstead.pro/checkin?utm=qr&c=abc123"),
    "abc123",
  );
  assert.equal(extractCheckInCode("http://localhost:3000/checkin?c=abc123"), "abc123");
});

test("gives nothing for input that names no token", () => {
  for (const bad of [
    "",
    "   ",
    "https://app.thingstead.pro/checkin",
    "https://app.thingstead.pro/checkin?c=",
    "https://example.test/somewhere/else",
    "http://",
  ]) {
    assert.equal(extractCheckInCode(bad), "", `expected "" for ${JSON.stringify(bad)}`);
  }
});
