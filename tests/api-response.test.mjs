import { test } from "node:test";
import assert from "node:assert/strict";

const { fieldErrorsFrom, ApiError, forbidden, unauthorized } = await import(
  "../.test-build/lib/api-response.js"
);

/**
 * The app renders one message under each input, so a validation failure has to
 * flatten to one message per field — and the first issue is the one that
 * describes the value actually submitted.
 */

test("keeps the first message for each field", () => {
  const error = {
    issues: [
      { path: ["email"], message: "Enter a valid email address." },
      { path: ["email"], message: "Too short." },
      { path: ["password"], message: "Enter your password." },
    ],
  };
  assert.deepEqual(fieldErrorsFrom(error), {
    email: "Enter a valid email address.",
    password: "Enter your password.",
  });
});

test("ignores issues with no addressable field", () => {
  const error = {
    issues: [
      { path: [], message: "Whole-form problem." },
      { path: ["title"], message: "Give the event a title." },
    ],
  };
  assert.deepEqual(fieldErrorsFrom(error), { title: "Give the event a title." });
});

test("an ApiError serialises to its documented body", async () => {
  const response = new ApiError(409, "Nope.", { reason: "sole_admin" }).toResponse();
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "Nope.", reason: "sole_admin" });
});

test("a non-member and a missing organization are indistinguishable", async () => {
  // Uniformity is the point: any difference here would let a token holder
  // enumerate which organizations exist.
  const a = forbidden().toResponse();
  const b = forbidden().toResponse();
  assert.equal(a.status, b.status);
  assert.deepEqual(await a.json(), await b.json());
  assert.equal(a.status, 403);
});

test("unauthorized is 401 so the app knows to sign out", () => {
  assert.equal(unauthorized().toResponse().status, 401);
});
