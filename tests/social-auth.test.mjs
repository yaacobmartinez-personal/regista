import test from "node:test";
import assert from "node:assert/strict";
import {
  appleBundleId,
  claimedVerified,
  googleClientId,
  identityFromApple,
  identityFromGoogle,
  sha256Hex,
} from "../.test-build/lib/social-identity.js";

test("email_verified is accepted as a boolean or the string form", () => {
  assert.equal(claimedVerified(true), true);
  assert.equal(claimedVerified("true"), true);
  assert.equal(claimedVerified(false), false);
  assert.equal(claimedVerified("false"), false);
  assert.equal(claimedVerified(undefined), false);
});

test("the nonce is compared as its SHA-256 hex digest", () => {
  assert.equal(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("a Google payload becomes an identity with a lower-cased email", () => {
  const id = identityFromGoogle({ sub: "g-1", email: "Ada@Example.com", email_verified: true, name: "Ada" });
  assert.deepEqual(id, { provider: "google", sub: "g-1", email: "ada@example.com", emailVerified: true, name: "Ada" });
});

test("a Google payload without an email is refused", () => {
  assert.throws(() => identityFromGoogle({ sub: "g-1" }), (e) => e.status === 401);
});

test("an Apple payload takes the name from the request, not the token", () => {
  const id = identityFromApple({ sub: "a-1", email: "relay@privaterelay.appleid.com", email_verified: "true" }, "Ada L");
  assert.equal(id.name, "Ada L");
  assert.equal(id.emailVerified, true);
});

test("an Apple payload with no email signals the revoke-and-retry remedy", () => {
  assert.throws(
    () => identityFromApple({ sub: "a-1" }, null),
    (e) => e.status === 400 && e.body?.reason === "apple_identity_incomplete",
  );
});

test("configuration comes from the environment with sensible absence", () => {
  assert.equal(googleClientId({}), null);
  assert.equal(googleClientId({ GOOGLE_WEB_CLIENT_ID: " x.apps.googleusercontent.com " }), "x.apps.googleusercontent.com");
  assert.equal(appleBundleId({}), "pro.thingstead.app");
});
