import test from "node:test";
import assert from "node:assert/strict";

import { buildReplyInput } from "../src/prompt.js";

test("buildReplyInput clamps length and excludes context when disabled", () => {
  const result = buildReplyInput({
    source: { text: "Hello" },
    thread: [{ text: "Context" }],
    preferences: {
      language: "zh-CN",
      maxCharacters: 999,
      includeContext: false,
      persona: "简洁"
    }
  });

  assert.equal(result.maxCharacters, 500);
  assert.match(result.instructions, /Simplified Chinese/);
  assert.match(result.instructions, /简洁/);
  assert.match(result.instructions, /real person casually joining a conversation/);
  assert.match(result.instructions, /Avoid canned openings/);
  assert.match(result.instructions, /exactly five meaningfully different candidates/);
  assert.deepEqual(JSON.parse(result.input).visibleThreadContext, []);
});

test("buildReplyInput keeps at most the last three context posts", () => {
  const result = buildReplyInput({
    source: { text: "Source" },
    thread: [
      { text: "1" },
      { text: "2" },
      { text: "3" },
      { text: "4" }
    ],
    preferences: { includeContext: true }
  });

  assert.deepEqual(
    JSON.parse(result.input).visibleThreadContext.map((post) => post.text),
    ["2", "3", "4"]
  );
});

test("buildReplyInput creates web-grounded hotspot posts without source context", () => {
  const result = buildReplyInput({
    mode: "post",
    source: { text: "" },
    thread: [{ text: "Feed post must not be used" }],
    draft: "",
    preferences: {
      language: "zh-CN",
      maxCharacters: 120,
      includeContext: true
    }
  });
  const input = JSON.parse(result.input);

  assert.equal(result.maxCharacters, 120);
  assert.match(result.instructions, /current AI developments/);
  assert.match(result.instructions, /search the live web/);
  assert.match(result.instructions, /exactly five meaningfully different candidates/);
  assert.equal(input.optionalExistingDraft, "");
  assert.match(input.task, /current AI hotspots/);
  assert.equal("sourcePost" in input, false);
  assert.equal("visibleThreadContext" in input, false);
});
