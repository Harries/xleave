import test from "node:test";
import assert from "node:assert/strict";

import {
  renderHomepage,
  renderPrivacyPage,
  renderSupportPage
} from "../src/homepage.js";

test("homepage introduces the extension and exposes expected destinations", () => {
  const html = renderHomepage();

  assert.match(html, /让每一次回复/);
  assert.match(html, /不会自动发送/);
  assert.match(html, /href="\/register"/);
  assert.doesNotMatch(html, /href="\/admin"/);
  assert.match(html, /https:\/\/github\.com\/Harries\/xleave/);
  assert.doesNotMatch(html, /twitter-logo|x-logo/i);
});

test("support page contains installation, access, and troubleshooting help", () => {
  const html = renderSupportPage();

  assert.match(html, /帮助与支持/);
  assert.match(html, /chrome:\/\/extensions/);
  assert.match(html, /Extension context invalidated/);
  assert.match(html, /累计 AI 使用次数/);
  assert.match(html, /github\.com\/Harries\/xleave\/issues\/new/);
  assert.doesNotMatch(html, /OPENAI_API_KEY=/);
});

test("privacy page accurately describes current data handling", () => {
  const html = renderPrivacyPage();

  assert.match(html, /隐私政策/);
  assert.match(html, /2026 年 7 月 13 日/);
  assert.match(html, /store: false/);
  assert.match(html, /DeepSeek/);
  assert.match(html, /AES-256-GCM/);
  assert.match(html, /Token 哈希/);
  assert.match(html, /不会写入 XLeave 的 Neon 用户数据库/);
  assert.match(html, /Vercel/);
  assert.match(html, /Neon/);
});
