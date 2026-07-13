import OpenAI from "openai";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";

export const AI_PROVIDERS = {
  openai: {
    label: "OpenAI",
    defaultModel: () => process.env.OPENAI_MODEL || "gpt-5.4-mini",
    baseURL: null,
    supportsPost: true
  },
  deepseek: {
    label: "DeepSeek",
    defaultModel: () => "deepseek-chat",
    baseURL: "https://api.deepseek.com",
    supportsPost: false
  }
};

export const ReplyOutput = z.object({
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

const TONE_ORDER = ["friendly", "concise", "thoughtful", "curious", "witty"];

export function resolveModel(provider, model) {
  const config = AI_PROVIDERS[provider];
  if (!config) throw new Error("暂不支持的 AI 服务商");
  const override = String(model || "").trim();
  return override || config.defaultModel();
}

/**
 * Generate reply/post candidates using the user's own provider + API key.
 * Returns { replies, sources } where replies is an array of { tone, label, text }.
 */
export async function generateCandidates({
  provider,
  apiKey,
  model,
  prompt,
  mode
}) {
  const config = AI_PROVIDERS[provider];
  if (!config) throw new Error("暂不支持的 AI 服务商");

  if (provider === "deepseek") {
    if (mode === "post") {
      throw badRequest(
        "DeepSeek 暂不支持联网发帖模式，请在个人中心切换到 OpenAI，或改用回复模式。"
      );
    }
    return generateWithDeepseek({ apiKey, model, prompt });
  }

  return generateWithOpenai({ apiKey, model, prompt, mode });
}

async function generateWithOpenai({ apiKey, model, prompt, mode }) {
  const client = new OpenAI({ apiKey });
  const requestOptions = {
    model: resolveModel("openai", model),
    reasoning: { effort: "low" },
    instructions: prompt.instructions,
    input: prompt.input,
    text: {
      format: zodTextFormat(ReplyOutput, "x_reply_candidates"),
      verbosity: "low"
    },
    store: false
  };

  if (mode === "post") {
    requestOptions.tools = [
      {
        type: "web_search",
        search_context_size: "medium",
        external_web_access: true
      }
    ];
    requestOptions.tool_choice = "required";
    requestOptions.include = ["web_search_call.action.sources"];
  }

  const result = await client.responses.parse(requestOptions);
  if (!result.output_parsed) {
    throw new Error("模型没有返回结构化结果");
  }

  return {
    replies: result.output_parsed.replies,
    sources: mode === "post" ? extractWebSources(result.output) : []
  };
}

async function generateWithDeepseek({ apiKey, model, prompt }) {
  const client = new OpenAI({
    apiKey,
    baseURL: AI_PROVIDERS.deepseek.baseURL
  });

  const completion = await client.chat.completions.create({
    model: resolveModel("deepseek", model),
    messages: buildDeepseekMessages(prompt),
    response_format: { type: "json_object" },
    temperature: 0.9
  });

  const content = completion.choices?.[0]?.message?.content || "";
  return { replies: parseDeepseekReplies(content), sources: [] };
}

// Exported for unit testing (pure, no network).
export function buildDeepseekMessages(prompt) {
  const shape = [
    "Return ONLY a valid JSON object, no markdown, no commentary.",
    'Shape: {"replies":[{"tone":string,"label":string,"text":string}]}.',
    `Provide exactly five items whose "tone" values are, in order: ${TONE_ORDER.join(", ")}.`,
    '"label" is a short Chinese label for the tone; "text" is the reply itself.'
  ].join(" ");

  return [
    { role: "system", content: `${prompt.instructions}\n${shape}` },
    { role: "user", content: prompt.input }
  ];
}

// Exported for unit testing.
export function parseDeepseekReplies(content) {
  let parsed;
  try {
    parsed = JSON.parse(extractJsonObject(content));
  } catch {
    throw new Error("AI 返回的内容不是有效的 JSON");
  }

  const result = ReplyOutput.safeParse(parsed);
  if (!result.success) {
    throw new Error("AI 返回的内容格式不符合要求");
  }
  return result.data.replies;
}

function extractJsonObject(content) {
  const text = String(content || "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1);
  }
  return text;
}

export function extractWebSources(output = []) {
  const sources = [];
  const seen = new Set();

  for (const item of output) {
    if (item?.type !== "web_search_call") continue;
    for (const source of item.action?.sources || []) {
      const url = String(source?.url || "").trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      sources.push({
        title: String(source?.title || source?.url || "热点来源").slice(0, 200),
        url
      });
      if (sources.length >= 6) return sources;
    }
  }

  return sources;
}

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}
