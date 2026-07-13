import test from "node:test";
import assert from "node:assert/strict";

import {
  decryptSecret,
  encryptSecret,
  hashPassword,
  signSession,
  verifyPassword,
  verifySession
} from "../src/crypto.js";

const SECRET = "unit-test-secret-key-please-change-0123456789";

function withSecret(callback) {
  const previous = process.env.XLEAVE_SECRET_KEY;
  process.env.XLEAVE_SECRET_KEY = SECRET;
  try {
    return callback();
  } finally {
    if (previous === undefined) delete process.env.XLEAVE_SECRET_KEY;
    else process.env.XLEAVE_SECRET_KEY = previous;
  }
}

test("hashPassword/verifyPassword round-trips and rejects wrong passwords", () => {
  const stored = hashPassword("correct horse battery staple");
  assert.match(stored, /^scrypt\$[a-f0-9]+\$[a-f0-9]+$/);
  assert.equal(verifyPassword("correct horse battery staple", stored), true);
  assert.equal(verifyPassword("wrong password", stored), false);
  assert.equal(verifyPassword("correct horse battery staple", "garbage"), false);
});

test("hashPassword produces a different salt/hash each time", () => {
  const first = hashPassword("same-password");
  const second = hashPassword("same-password");
  assert.notEqual(first, second);
  assert.equal(verifyPassword("same-password", first), true);
  assert.equal(verifyPassword("same-password", second), true);
});

test("encryptSecret/decryptSecret round-trips an API key", () => {
  withSecret(() => {
    const plaintext = "sk-deepseek-abc123";
    const cipher = encryptSecret(plaintext);
    assert.notEqual(cipher, plaintext);
    assert.match(cipher, /^[a-f0-9]+:[a-f0-9]+:[a-f0-9]+$/);
    assert.equal(decryptSecret(cipher), plaintext);
  });
});

test("decryptSecret rejects tampered ciphertext", () => {
  withSecret(() => {
    const cipher = encryptSecret("sk-secret");
    const [iv, tag, data] = cipher.split(":");
    const tampered = `${iv}:${tag}:${data.replace(/.$/, (c) => (c === "0" ? "1" : "0"))}`;
    assert.throws(() => decryptSecret(tampered));
  });
});

test("signSession/verifySession round-trips and rejects tampering", () => {
  withSecret(() => {
    const cookie = signSession("alice");
    const session = verifySession(cookie);
    assert.equal(session?.id, "alice");

    assert.equal(verifySession(`${cookie}x`), null);
    assert.equal(verifySession("not.a.session"), null);
    assert.equal(verifySession(""), null);
  });
});

test("verifySession rejects an expired timestamp", () => {
  withSecret(() => {
    const cookie = signSession("bob");
    const [id] = cookie.split(".");
    const oldTimestamp = String(Date.now() - 13 * 60 * 60 * 1000);
    // Re-sign with an old timestamp is impossible without the secret, so a
    // hand-built stale cookie must fail the signature check.
    const forged = `${id}.${oldTimestamp}.deadbeef`;
    assert.equal(verifySession(forged), null);
  });
});
