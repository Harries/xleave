import test from "node:test";
import assert from "node:assert/strict";

import {
  extractBearerToken,
  requireApiToken,
  safeTokenEqual
} from "../src/auth.js";

test("extractBearerToken accepts a Bearer authorization header", () => {
  assert.equal(extractBearerToken("Bearer secret-token"), "secret-token");
  assert.equal(extractBearerToken("bearer another-token"), "another-token");
});

test("extractBearerToken rejects unsupported or missing headers", () => {
  assert.equal(extractBearerToken("Basic abc"), "");
  assert.equal(extractBearerToken(undefined), "");
});

test("safeTokenEqual only accepts an exact token", () => {
  assert.equal(safeTokenEqual("correct-token", "correct-token"), true);
  assert.equal(safeTokenEqual("wrong-token", "correct-token"), false);
  assert.equal(safeTokenEqual("short", "a-much-longer-token"), false);
});

test("requireApiToken rejects missing and invalid tokens", () => {
  const previousToken = process.env.XLEAVE_API_TOKEN;
  process.env.XLEAVE_API_TOKEN = "correct-token";

  try {
    const missing = createResponse();
    requireApiToken({ get: () => undefined }, missing.response, () => {
      assert.fail("missing token must not call next");
    });
    assert.equal(missing.statusCode, 401);
    assert.deepEqual(missing.body, { error: "访问令牌无效" });

    const invalid = createResponse();
    requireApiToken(
      { get: () => "Bearer wrong-token" },
      invalid.response,
      () => assert.fail("invalid token must not call next")
    );
    assert.equal(invalid.statusCode, 401);
  } finally {
    restoreEnvironmentToken(previousToken);
  }
});

test("requireApiToken accepts the configured token", () => {
  const previousToken = process.env.XLEAVE_API_TOKEN;
  process.env.XLEAVE_API_TOKEN = "correct-token";
  let nextCalled = false;

  try {
    const result = createResponse();
    requireApiToken(
      { get: () => "Bearer correct-token" },
      result.response,
      () => {
        nextCalled = true;
      }
    );
    assert.equal(nextCalled, true);
    assert.equal(result.statusCode, undefined);
  } finally {
    restoreEnvironmentToken(previousToken);
  }
});

test("requireApiToken fails closed when the server token is not configured", () => {
  const previousToken = process.env.XLEAVE_API_TOKEN;
  delete process.env.XLEAVE_API_TOKEN;

  try {
    const result = createResponse();
    requireApiToken(
      { get: () => "Bearer any-token" },
      result.response,
      () => assert.fail("unconfigured authentication must not call next")
    );
    assert.equal(result.statusCode, 503);
    assert.deepEqual(result.body, {
      error: "后端尚未配置 XLEAVE_API_TOKEN"
    });
  } finally {
    restoreEnvironmentToken(previousToken);
  }
});

function createResponse() {
  const result = {
    statusCode: undefined,
    body: undefined,
    response: {
      status(code) {
        result.statusCode = code;
        return this;
      },
      json(body) {
        result.body = body;
        return this;
      }
    }
  };

  return result;
}

function restoreEnvironmentToken(previousToken) {
  if (previousToken === undefined) {
    delete process.env.XLEAVE_API_TOKEN;
  } else {
    process.env.XLEAVE_API_TOKEN = previousToken;
  }
}
