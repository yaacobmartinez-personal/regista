import test from "node:test";
import assert from "node:assert/strict";
import { androidCertFingerprints, appleTeamId } from "../.test-build/lib/app-links.js";

test("the upload key is always listed, once", () => {
  const list = androidCertFingerprints({});
  assert.equal(list.length, 1);
  assert.match(list[0], /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
});

test("extra fingerprints from the environment are added, normalised, deduplicated", () => {
  const upload = androidCertFingerprints({})[0];
  const play = "aa:bb:cc:dd:ee:ff:00:11:22:33:44:55:66:77:88:99:aa:bb:cc:dd:ee:ff:00:11:22:33:44:55:66:77:88:99";
  const list = androidCertFingerprints({ ANDROID_CERT_SHA256: ` ${play} , ${upload.toLowerCase()}, not-a-fingerprint` });
  assert.deepEqual(list, [upload, play.toUpperCase()]);
});

test("the Apple team id must look like one", () => {
  assert.equal(appleTeamId({}), null);
  assert.equal(appleTeamId({ APPLE_TEAM_ID: "abc" }), null);
  assert.equal(appleTeamId({ APPLE_TEAM_ID: " ABCDE12345 " }), "ABCDE12345");
});
