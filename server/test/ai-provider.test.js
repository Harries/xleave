import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDeepseekMessages,
  generateCandidates,
  parseDeepseekReplies,
  resolveModel
} from "../src/ai-provider.js";

const VALID_REPLIES = {
  replies: [
    { tone: "friendly", label: "友好", text: "a" },
    { tone: "concise", label: "简短", text: "b" },
    { tone: "thoughtful", label: "思考", text: "c" },
    { tone: "curious", label: "好奇", text: "d" },
    { tone: "witty", label: "幽默", text: "e" }
  ]
};

test("resolveModel falls back to provider defaults and honors overrides", () => {
  const previous = process.env.OPENAI_MODEL;
  delete process.env.OPENAI_MODEL;
  try {
    assert.equal(resolveModel("openai"), "gpt-5.4-mini");
    assert.equal(resolveModel("deepseek"), "deepseek-chat");
    assert.equal(resolveModel("deepseek", "deepseek-reasoner"), "deepseek-reasoner");
  } finally {
    if (previous === undefined) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = previous;
  }
});

test("buildDeepseekMessages assembles system + user messages", () => {
  const messages = buildDeepseekMessages({
    instructions: "SYSTEM RULES",
    input: "USER PAYLOAD"
  });
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, "system");
  assert.match(messages[0].content, /SYSTEM RULES/);
  assert.match(messages[0].content, /JSON/);
  assert.equal(messages[1].role, "user");
  assert.equal(messages[1].content, "USER PAYLOAD");
});

test("parseDeepseekReplies accepts valid JSON and fenced JSON", () => {
  assert.deepEqual(
    parseDeepseekReplies(JSON.stringify(VALID_REPLIES)),
    VALID_REPLIES.replies
  );
  assert.deepEqual(
    parseDeepseekReplies("```json\n" + JSON.stringify(VALID_REPLIES) + "\n```"),
    VALID_REPLIES.replies
  );
});

test("parseDeepseekReplies rejects malformed or schema-violating output", () => {
  assert.throws(() => parseDeepseekReplies("not json"));
  assert.throws(() =>
    parseDeepseekReplies(
      JSON.stringify({ replies: VALID_REPLIES.replies.slice(0, 3) })
    )
  );
});

test("generateCandidates rejects DeepSeek in post mode", async () => {
  await assert.rejects(
    generateCandidates({
      provider: "deepseek",
      apiKey: "sk-x",
      prompt: { instructions: "i", input: "u" },
      mode: "post"
    }),
    /DeepSeek 暂不支持联网发帖/
  );
});

test("generateCandidates rejects unknown providers", async () => {
  await assert.rejects(
    generateCandidates({
      provider: "unknown",
      apiKey: "sk-x",
      prompt: { instructions: "i", input: "u" },
      mode: "reply"
    }),
    /暂不支持的 AI 服务商/
  );
});
