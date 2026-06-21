import test from "node:test";
import assert from "node:assert/strict";

import { generateToken, hashToken } from "../src/user-store.js";

test("generateToken creates a 256-bit hexadecimal token", () => {
  const first = generateToken();
  const second = generateToken();

  assert.match(first, /^[a-f0-9]{64}$/);
  assert.match(second, /^[a-f0-9]{64}$/);
  assert.notEqual(first, second);
});

test("hashToken returns a stable SHA-256 hash without exposing the token", () => {
  const token = "a".repeat(64);
  const hash = hashToken(token);

  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(hash, hashToken(token));
  assert.notEqual(hash, token);
});
