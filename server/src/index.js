import "dotenv/config";

import express from "express";
import OpenAI from "openai";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";

import { requireUser } from "./auth.js";
import { registerAdminRoutes } from "./admin.js";
import { getClientIp, requireAllowedIp } from "./ip-access.js";
import { buildReplyInput } from "./prompt.js";

const PORT = Number(process.env.PORT || 8787);
const MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";

const ReplyRequest = z.object({
  source: z
    .object({
      author: z.string().max(200).default(""),
      handle: z.string().max(200).default(""),
      text: z.string().max(10000),
      url: z.string().max(2000).default("")
    })
    .refine((post) => post.text.trim().length > 0, "没有识别到原帖文字"),
  thread: z
    .array(
      z.object({
        author: z.string().max(200).default(""),
        handle: z.string().max(200).default(""),
        text: z.string().max(10000),
        url: z.string().max(2000).optional()
      })
    )
    .max(3)
    .default([]),
  draft: z.string().max(2000).default(""),
  pageUrl: z.string().max(2000).default(""),
  preferences: z
    .object({
      language: z.enum(["auto", "zh-CN", "zh-TW", "en", "ja"]).default("auto"),
      maxCharacters: z.number().int().min(30).max(500).default(180),
      includeContext: z.boolean().default(true),
      persona: z.string().max(1000).default("")
    })
    .default({})
});

const ReplyOutput = z.object({
  replies: z
    .array(
      z.object({
        tone: z.enum(["friendly", "concise", "thoughtful", "curious", "witty"]),
        label: z.string(),
        text: z.string()
      })
    )
    .length(5)
});

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));
app.use(express.urlencoded({ extended: false, limit: "16kb" }));

registerAdminRoutes(app);

app.get("/health", (_request, response) => {
  response.json({ ok: true, model: MODEL });
});

app.get("/ip", (request, response) => {
  response.set("Cache-Control", "no-store");
  response.json({ ip: getClientIp(request) || null });
});

app.post(
  "/api/replies",
  requireUser,
  requireAllowedIp,
  async (request, response) => {
    response.set("Cache-Control", "no-store");

    const parsed = ReplyRequest.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json({
        error: parsed.error.issues[0]?.message || "请求内容无效"
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return response.status(500).json({
        error: "后端尚未配置 OPENAI_API_KEY"
      });
    }

    try {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const prompt = buildReplyInput(parsed.data);

      const result = await client.responses.parse({
        model: MODEL,
        reasoning: { effort: "low" },
        instructions: prompt.instructions,
        input: prompt.input,
        text: {
          format: zodTextFormat(ReplyOutput, "x_reply_candidates"),
          verbosity: "low"
        },
        store: false
      });

      if (!result.output_parsed) {
        throw new Error("模型没有返回结构化结果");
      }

      const replies = result.output_parsed.replies.map((reply) => ({
        ...reply,
        text: trimToCharacters(reply.text.trim(), prompt.maxCharacters)
      }));

      return response.json({ replies });
    } catch (error) {
      console.error(error);
      const status = Number(error?.status);
      return response.status(status >= 400 && status < 600 ? status : 502).json({
        error: publicError(error)
      });
    }
  }
);

app.use((_request, response) => {
  response.status(404).json({ error: "接口不存在" });
});

if (!process.env.VERCEL) {
  app.listen(PORT, "127.0.0.1", () => {
    console.log(`X AI Reply server listening on http://localhost:${PORT}`);
  });
}

export default app;

function trimToCharacters(text, maxCharacters) {
  return [...text].slice(0, maxCharacters).join("");
}

function publicError(error) {
  if (error?.status === 401) return "OpenAI API Key 无效";
  if (error?.status === 429) return "OpenAI 请求过于频繁或额度不足";
  if (error?.status >= 400 && error?.status < 500) {
    return error.message || "OpenAI 请求参数错误";
  }
  return "AI 服务暂时不可用，请稍后重试";
}
