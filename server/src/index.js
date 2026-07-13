import "dotenv/config";

import express from "express";
import { z } from "zod";

import { requireUser } from "./auth.js";
import { registerAdminRoutes } from "./admin.js";
import { registerUserCenter } from "./user-center.js";
import { registerHomepage } from "./homepage.js";
import { getClientIp, requireAllowedIp } from "./ip-access.js";
import { buildReplyInput } from "./prompt.js";
import { recordUserUsage } from "./user-store.js";
import { generateCandidates } from "./ai-provider.js";
import { decryptSecret, isSecretConfigured } from "./crypto.js";

const PORT = Number(process.env.PORT || 8787);
const MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";

const ReplyRequest = z.object({
  mode: z.enum(["reply", "post"]).default("reply"),
  source: z
    .object({
      author: z.string().max(200).default(""),
      handle: z.string().max(200).default(""),
      text: z.string().max(10000),
      languageHint: z.string().max(80).optional(),
      url: z.string().max(2000).default("")
    }),
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
}).superRefine((value, context) => {
  if (value.mode === "reply" && !value.source.text.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "没有识别到原帖文字",
      path: ["source", "text"]
    });
  }
});

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));
app.use(express.urlencoded({ extended: false, limit: "16kb" }));

registerHomepage(app);
registerUserCenter(app);
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

    const user = response.locals.user;
    if (!user?.aiKeyCipher) {
      return response.status(400).json({
        error: "请先在个人中心设置 AI Token"
      });
    }
    if (!isSecretConfigured()) {
      return response.status(500).json({
        error: "后端尚未配置 XLEAVE_SECRET_KEY，无法解密 AI 密钥"
      });
    }

    let apiKey;
    try {
      apiKey = decryptSecret(user.aiKeyCipher);
    } catch (error) {
      console.error("[X AI Reply] failed to decrypt AI key", error);
      return response.status(500).json({
        error: "AI 密钥解密失败，请在个人中心重新保存"
      });
    }

    // Generation preferences are managed server-side in the personal center;
    // for stored (neon) users they override whatever the extension sends.
    const requestData = { ...parsed.data };
    if (user.source === "neon") {
      requestData.preferences = {
        ...requestData.preferences,
        persona: user.persona || "",
        language: user.prefLanguage || requestData.preferences.language,
        maxCharacters:
          user.prefMaxCharacters ?? requestData.preferences.maxCharacters,
        includeContext:
          user.prefIncludeContext ?? requestData.preferences.includeContext
      };
    }

    try {
      const prompt = buildReplyInput(requestData);

      const { replies: rawReplies, sources } = await generateCandidates({
        provider: user.aiProvider || "openai",
        apiKey,
        model: user.aiModel,
        prompt,
        mode: parsed.data.mode
      });

      const replies = rawReplies.map((reply) => ({
        ...reply,
        text: trimToCharacters(reply.text.trim(), prompt.maxCharacters)
      }));

      try {
        await recordUserUsage(response.locals.user);
      } catch (usageError) {
        console.error("[X AI Reply] failed to record usage", usageError);
      }

      return response.json({ replies, sources });
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
  if (error?.status === 401) return "AI API Key 无效";
  if (error?.status === 429) return "AI 请求过于频繁或额度不足";
  if (error?.status >= 400 && error?.status < 500) {
    return error.message || "AI 请求参数错误";
  }
  return "AI 服务暂时不可用，请稍后重试";
}
