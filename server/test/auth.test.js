import test from "node:test";
import assert from "node:assert/strict";

import {
  extractBearerToken,
  parseUsers,
  requireUser,
  safeTokenEqual
} from "../src/auth.js";

const TOKEN = "a".repeat(64);
const USERS_JSON = JSON.stringify([
  {
    id: "harries",
    token: TOKEN,
    allowedIps: ["203.0.113.10", "2001:db8::1"]
  }
]);

test("parseUsers accepts valid users and rejects duplicate IDs, tokens, or weak records", () => {
  const users = parseUsers(
    JSON.stringify([
      { id: "harries", token: TOKEN, allowedIps: ["203.0.113.10"] },
      { id: "harries", token: "b".repeat(64), allowedIps: [] },
      { id: "bob", token: TOKEN, allowedIps: [] },
      { id: "x", token: "c".repeat(64), allowedIps: [] },
      { id: "alice", token: "short", allowedIps: [] }
    ])
  );

  assert.deepEqual(users, [
    {
      id: "harries",
      token: TOKEN,
      allowedIps: ["203.0.113.10"]
    }
  ]);
  assert.deepEqual(parseUsers("not-json"), []);
});

test("extractBearerToken accepts Bearer and rejects unsupported headers", () => {
  assert.equal(extractBearerToken(`Bearer ${TOKEN}`), TOKEN);
  assert.equal(extractBearerToken("Basic abc"), "");
  assert.equal(extractBearerToken(undefined), "");
});

test("safeTokenEqual only accepts an exact token", () => {
  assert.equal(safeTokenEqual(TOKEN, TOKEN), true);
  assert.equal(safeTokenEqual("b".repeat(64), TOKEN), false);
  assert.equal(safeTokenEqual("short", TOKEN), false);
});

test("requireUser authenticates a configured user", async () => {
  await withUsers(USERS_JSON, async () => {
    let nextCalled = false;
    const result = createResponse();

    await requireUser(
      createRequest({ token: TOKEN }),
      result.response,
      () => {
        nextCalled = true;
      }
    );

    assert.equal(nextCalled, true);
    assert.deepEqual(result.response.locals.user, {
      id: "harries",
      allowedIps: ["203.0.113.10", "2001:db8::1"],
      source: "environment",
      aiProvider: "openai",
      aiKeyCipher: null,
      aiModel: null,
      persona: "",
      prefLanguage: null,
      prefMaxCharacters: null,
      prefIncludeContext: null
    });
  });
});

test("requireUser rejects invalid or missing tokens", async () => {
  await withUsers(USERS_JSON, async () => {
    for (const credentials of [
      { token: "b".repeat(64) },
      { token: "" }
    ]) {
      const result = createResponse();
      await requireUser(
        createRequest(credentials),
        result.response,
        () => assert.fail("invalid credentials must not call next")
      );
      assert.equal(result.statusCode, 401);
      assert.deepEqual(result.body, {
        error: "访问令牌无效"
      });
    }
  });
});

test("requireUser fails closed when XLEAVE_USERS is invalid", async () => {
  await withUsers("", async () => {
    const result = createResponse();
    await requireUser(
      createRequest({ token: TOKEN }),
      result.response,
      () => assert.fail("invalid server config must not call next")
    );
    assert.equal(result.statusCode, 503);
    assert.deepEqual(result.body, {
      error: "后端尚未配置用户存储"
    });
  });
});

function createRequest({ token }) {
  return {
    get(name) {
      if (name === "authorization") return token ? `Bearer ${token}` : undefined;
      return undefined;
    }
  };
}
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

async function withUsers(value, callback) {
  const previous = process.env.XLEAVE_USERS;
  process.env.XLEAVE_USERS = value;
  try {
    await callback();
  } finally {
    if (previous === undefined) {
      delete process.env.XLEAVE_USERS;
    } else {
      process.env.XLEAVE_USERS = previous;
    }
  }
}
