const DEFAULT_SETTINGS = {
  backendUrl: "https://xleave.59et.com",
  language: "auto",
  maxCharacters: 180,
  includeContext: true,
  persona: ""
};

const LEGACY_BACKEND_URLS = new Set([
  "http://localhost:8787",
  "http://127.0.0.1:8787"
]);

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== "install" && reason !== "update") return;

  const { backendUrl } = await chrome.storage.sync.get("backendUrl");
  if (!backendUrl || LEGACY_BACKEND_URLS.has(backendUrl.replace(/\/+$/, ""))) {
    await chrome.storage.sync.set({
      backendUrl: DEFAULT_SETTINGS.backendUrl
    });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "GENERATE_REPLIES") {
    return false;
  }

  generateReplies(message.payload)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => {
      console.error("[X AI Reply]", error);
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "生成回复失败"
      });
    });

  return true;
});

async function generateReplies(payload) {
  const [settings, localSettings] = await Promise.all([
    chrome.storage.sync.get(DEFAULT_SETTINGS),
    chrome.storage.local.get({ apiToken: "" })
  ]);
  const backendUrl = settings.backendUrl.replace(/\/+$/, "");
  const apiToken = localSettings.apiToken.trim();

  if (!apiToken) {
    throw new Error("请先在插件设置中填写访问令牌");
  }

  const response = await fetch(`${backendUrl}/api/replies`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiToken}`
    },
    body: JSON.stringify({
      ...payload,
      preferences: {
        language: settings.language,
        maxCharacters: settings.maxCharacters,
        includeContext: settings.includeContext,
        persona: settings.persona
      }
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `后端请求失败（${response.status}）`);
  }

  if (!Array.isArray(data.replies) || data.replies.length === 0) {
    throw new Error("后端没有返回有效的回复候选");
  }

  return data;
}
