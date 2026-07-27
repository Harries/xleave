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
    defaultModel: () => process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
    baseURL: "https://api.deepseek.com",
    supportsPost: false
  },
  minimax: {
    label: "MiniMax",
    // Default to M3: it's the only MiniMax model whose chain-of-thought can be
    // switched off (see generateWithChatCompletions), which is what keeps reply
    // latency low. The M2.x models always "think" and stay slow for short replies.
    defaultModel: () => process.env.MINIMAX_MODEL || "MiniMax-M3",
    // Default to the China-mainland host (api.minimaxi.com — note the "i").
    // Set MINIMAX_BASE_URL=https://api.minimax.io/v1 for international accounts.
    baseURL: process.env.MINIMAX_BASE_URL || "https://api.minimaxi.com/v1",
    supportsPost: false
  }
};

const TONE_ORDER = ["friendly", "concise", "thoughtful", "curious", "witty"];

// How many candidates each mode generates. Reply mode is kept lean (2) so the
// blocking model call returns faster; post mode still offers a full spread.
export const CANDIDATE_COUNTS = { reply: 2, post: 5 };

function candidateCount(mode) {
  return mode === "post" ? CANDIDATE_COUNTS.post : CANDIDATE_COUNTS.reply;
}

// Upper bound on generated tokens so a runaway completion can't stall the
// blocking call. Sized generously (~3 tokens per Unicode char, worst case for
// CJK) so it never truncates the structured JSON, only caps pathological runs.
function replyTokenBudget(maxCharacters, count) {
  const chars = Number(maxCharacters) || 180;
  return Math.min(6000, count * chars * 3 + 400);
}

// Structured-output schema for `count` candidates, in TONE_ORDER order.
function makeReplyOutput(count) {
  return z.object({
    replies: z
      .array(
        z.object({
          tone: z.enum(TONE_ORDER),
          label: z.string(),
          text: z.string()
        })
      )
      .length(count)
  });
}

// Stable priority order used when the default provider has no key configured.
const PROVIDER_FALLBACK_ORDER = ["openai", "deepseek", "minimax"];

/**
 * Decide which provider a request should use given the user's configured keys.
 * - post mode always needs OpenAI (only OpenAI can web-search)
 * - otherwise honor the default provider, falling back to whichever key exists
 * Returns { provider } on success, or { error } with a stable reason code.
 */
export function chooseProvider({
  mode,
  defaultProvider,
  hasOpenai,
  hasDeepseek,
  hasMinimax
}) {
  const available = {
    openai: Boolean(hasOpenai),
    deepseek: Boolean(hasDeepseek),
    minimax: Boolean(hasMinimax)
  };
  if (!available.openai && !available.deepseek && !available.minimax) {
    return { error: "no-key" };
  }

  if (mode === "post") {
    if (!available.openai) return { error: "post-needs-openai" };
    return { provider: "openai" };
  }

  const preferred = PROVIDER_FALLBACK_ORDER.includes(defaultProvider)
    ? defaultProvider
    : "openai";
  if (available[preferred]) return { provider: preferred };

  return { provider: PROVIDER_FALLBACK_ORDER.find((p) => available[p]) };
}

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

  const count = candidateCount(mode);

  if (provider === "openai") {
    return generateWithOpenai({ apiKey, model, prompt, mode, count });
  }

  // Every other provider is an OpenAI-compatible chat-completions endpoint that
  // can't web-search, so it can't serve post mode.
  if (mode === "post") {
    throw badRequest(
      `${config.label} 暂不支持联网发帖模式，请在个人中心切换到 OpenAI，或改用回复模式。`
    );
  }
  return generateWithChatCompletions({ provider, apiKey, model, prompt, count });
}

async function generateWithOpenai({ apiKey, model, prompt, mode, count }) {
  const client = new OpenAI({ apiKey });
  const isPost = mode === "post";
  const requestOptions = {
    model: resolveModel("openai", model),
    // Reply mode is short casual text that needs no chain-of-thought, so run the
    // model at minimal reasoning for a much faster return. Post mode keeps some
    // reasoning to synthesize live web-search results.
    reasoning: { effort: isPost ? "low" : "minimal" },
    instructions: prompt.instructions,
    input: prompt.input,
    text: {
      format: zodTextFormat(makeReplyOutput(count), "x_reply_candidates"),
      verbosity: "low"
    },
    store: false
  };

  if (!isPost) {
    requestOptions.max_output_tokens = replyTokenBudget(prompt.maxCharacters, count);
  }

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

// Shared path for OpenAI-compatible chat-completions providers (DeepSeek,
// MiniMax, …). They all speak the same JSON-object protocol; only the baseURL
// and model default differ, both keyed off the provider.
async function generateWithChatCompletions({ provider, apiKey, model, prompt, count }) {
  const replyCount = count ?? CANDIDATE_COUNTS.reply;
  const client = new OpenAI({
    apiKey,
    baseURL: AI_PROVIDERS[provider].baseURL
  });

  const requestBody = {
    model: resolveModel(provider, model),
    messages: buildDeepseekMessages(prompt, replyCount),
    response_format: { type: "json_object" },
    temperature: 0.9,
    max_tokens: replyTokenBudget(prompt.maxCharacters, replyCount)
  };

  // MiniMax M3 answers directly (no chain-of-thought) when thinking is disabled,
  // which is far faster for short replies. M2.x accepts the flag but keeps
  // thinking on, so sending it is always safe for MiniMax.
  if (provider === "minimax") {
    requestBody.thinking = { type: "disabled" };
  }

  const completion = await client.chat.completions.create(requestBody);

  const content = completion.choices?.[0]?.message?.content || "";
  return { replies: parseDeepseekReplies(content, replyCount), sources: [] };
}

// Exported for unit testing (pure, no network).
export function buildDeepseekMessages(prompt, count = CANDIDATE_COUNTS.reply) {
  const tones = TONE_ORDER.slice(0, count);
  const shape = [
    "Return ONLY a valid JSON object, no markdown, no commentary.",
    'Shape: {"replies":[{"tone":string,"label":string,"text":string}]}.',
    `Provide exactly ${count} items whose "tone" values are, in order: ${tones.join(", ")}.`,
    '"label" is a short Chinese label for the tone; "text" is the reply itself.'
  ].join(" ");

  return [
    { role: "system", content: `${prompt.instructions}\n${shape}` },
    { role: "user", content: prompt.input }
  ];
}

// Exported for unit testing.
export function parseDeepseekReplies(content, count = CANDIDATE_COUNTS.reply) {
  let parsed;
  try {
    parsed = JSON.parse(extractJsonObject(content));
  } catch {
    throw new Error("AI 返回的内容不是有效的 JSON");
  }

  const result = makeReplyOutput(count).safeParse(parsed);
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
