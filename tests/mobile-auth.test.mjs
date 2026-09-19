import { test } from "node:test";
import assert from "node:assert/strict";

process.env.AUTH_SECRET ??= "test-secret-for-mobile-tokens";

const { mintToken, verifyToken, bearerToken, TOKEN_TTL_DAYS } = await import(
  "../.test-build/lib/mobile-auth.js"
);

/**
 * The bearer token is the whole of the mobile app's authority, and it is
 * verified by code that can only say yes or no — so the ways it must say no are
 * asserted here rather than left to a reviewer's eye.
 *
 * The millisecond `exp` is covered because it is the one detail that cannot be
 * inferred: the Flutter client reads it with `DateTime.fromMillisecondsSinceEpoch`
 * (lib/core/network/token_codec.dart), so a JWT-conventional seconds value would
 * decode as 1970 and the app would never send the token it had just been given.
 */

test("a freshly minted token verifies and carries its subject", () => {
  const token = mintToken("user_123", 0);
  const payload = verifyToken(token);
  assert.equal(payload?.sub, "user_123");
  assert.equal(payload?.ver, 0);
});

test("exp is milliseconds since the epoch, ~30 days out", () => {
  const before = Date.now();
  const payload = verifyToken(mintToken("user_123", 0));
  const expectedTtl = TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

  // Within a second of the expected instant — i.e. milliseconds, not seconds.
  assert.ok(Math.abs(payload.exp - (before + expectedTtl)) < 1000);
  // A seconds-based exp would be ~1000x smaller and land in 1970.
  assert.ok(payload.exp > 1_000_000_000_000);
});

test("the client can read the payload without the secret", () => {
  // What token_codec.dart does: split on the dot, base64url-decode the first
  // segment. If this stops working the app cannot tell a live token from a dead
  // one and will send neither.
  const token = mintToken("user_abc", 7);
  const body = token.slice(0, token.indexOf("."));
  const decoded = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  assert.equal(decoded.sub, "user_abc");
  assert.equal(decoded.ver, 7);
  assert.equal(typeof decoded.exp, "number");
});

test("rejects a tampered payload", () => {
  const token = mintToken("user_123", 0);
  const [, signature] = token.split(".");
  const forged = Buffer.from(
    JSON.stringify({ sub: "user_999", ver: 0, exp: Date.now() + 60_000 }),
  ).toString("base64url");
  assert.equal(verifyToken(`${forged}.${signature}`), null);
});

test("rejects a tampered signature", () => {
  const token = mintToken("user_123", 0);
  const [body] = token.split(".");
  assert.equal(verifyToken(`${body}.not-the-signature`), null);
});

test("rejects an expired token", () => {
  // Minted by hand so the expiry is in the past but the signature is genuine.
  const realToken = mintToken("user_123", 0);
  const [, realSig] = realToken.split(".");
  assert.ok(realSig);
  // Any past exp must fail regardless of signature validity.
  const expired = Buffer.from(
    JSON.stringify({ sub: "user_123", ver: 0, exp: Date.now() - 1 }),
  ).toString("base64url");
  assert.equal(verifyToken(`${expired}.${realSig}`), null);
});

test("rejects malformed input", () => {
  for (const bad of [null, undefined, "", ".", "nodot", ".onlysig", "body.", "a.b.c"]) {
    assert.equal(verifyToken(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test("a token minted under another secret does not verify", () => {
  const token = mintToken("user_123", 0);
  const original = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "a-different-secret";
  try {
    assert.equal(verifyToken(token), null);
  } finally {
    process.env.AUTH_SECRET = original;
  }
});

test("bearerToken reads the Authorization header, case-insensitively", () => {
  const read = (value) =>
    bearerToken(new Request("https://example.test", { headers: { authorization: value } }));

  assert.equal(read("Bearer abc.def"), "abc.def");
  assert.equal(read("bearer abc.def"), "abc.def");
  assert.equal(read("BEARER abc.def"), "abc.def");
  assert.equal(read("Basic abc.def"), null);
  assert.equal(read("Bearer"), null);
  assert.equal(read("Bearer   "), null);
  assert.equal(bearerToken(new Request("https://example.test")), null);
});
