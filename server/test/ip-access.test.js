import test from "node:test";
import assert from "node:assert/strict";

import {
  getClientIp,
  normalizeIp,
  parseAllowedIps,
  requireAllowedIp
} from "../src/ip-access.js";

test("parseAllowedIps accepts comma-separated IPv4 and IPv6 addresses", () => {
  assert.deepEqual(
    [...parseAllowedIps("203.0.113.10, 2001:db8::1, invalid")],
    ["203.0.113.10", "2001:db8::1"]
  );
});

test("normalizeIp handles mapped IPv4, brackets, and ports", () => {
  assert.equal(normalizeIp("::ffff:203.0.113.10"), "203.0.113.10");
  assert.equal(normalizeIp("[2001:db8::1]:443"), "2001:db8::1");
  assert.equal(normalizeIp("203.0.113.10:1234"), "203.0.113.10");
});

test("getClientIp uses Vercel's x-real-ip header", () => {
  const previousVercel = process.env.VERCEL;
  process.env.VERCEL = "1";

  try {
    assert.equal(
      getClientIp({
        get: (name) => (name === "x-real-ip" ? "203.0.113.10" : undefined)
      }),
      "203.0.113.10"
    );
  } finally {
    restoreEnv("VERCEL", previousVercel);
  }
});

test("requireAllowedIp accepts only configured addresses", () => {
  const previousVercel = process.env.VERCEL;
  process.env.VERCEL = "1";

  try {
    let nextCalled = false;
    const allowed = createResponse();
    allowed.response.locals.user = {
      id: "harries",
      allowedIps: ["203.0.113.10", "2001:db8::1"]
    };
    requireAllowedIp(
      { get: () => "203.0.113.10" },
      allowed.response,
      () => {
        nextCalled = true;
      }
    );
    assert.equal(nextCalled, true);

    const blocked = createResponse();
    blocked.response.locals.user = {
      id: "harries",
      allowedIps: ["203.0.113.10", "2001:db8::1"]
    };
    requireAllowedIp(
      { get: () => "198.51.100.20" },
      blocked.response,
      () => assert.fail("blocked IP must not call next")
    );
    assert.equal(blocked.statusCode, 403);
    assert.deepEqual(blocked.body, {
      error: "当前公网 IP 不允许访问：198.51.100.20",
      clientIp: "198.51.100.20"
    });
  } finally {
    restoreEnv("VERCEL", previousVercel);
  }
});

test("requireAllowedIp fails closed when no valid list is configured", () => {
  const previousVercel = process.env.VERCEL;
  process.env.VERCEL = "1";

  try {
    const result = createResponse();
    result.response.locals.user = {
      id: "harries",
      allowedIps: []
    };
    requireAllowedIp(
      { get: () => "203.0.113.10" },
      result.response,
      () => assert.fail("missing allowlist must not call next")
    );
    assert.equal(result.statusCode, 503);
    assert.deepEqual(result.body, {
      error: "用户尚未配置有效的公网 IP；当前公网 IP：203.0.113.10",
      clientIp: "203.0.113.10"
    });
  } finally {
    restoreEnv("VERCEL", previousVercel);
  }
});

function createResponse() {
  const result = {
    statusCode: undefined,
    body: undefined,
    response: {
      locals: {},
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

function restoreEnv(name, previousValue) {
  if (previousValue === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = previousValue;
  }
}
