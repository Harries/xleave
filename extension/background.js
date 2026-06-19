const DEFAULT_SETTINGS = {
  backendUrl: "http://localhost:8787",
  language: "auto",
  maxCharacters: 180,
  includeContext: true,
  persona: ""
};

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
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  const backendUrl = settings.backendUrl.replace(/\/+$/, "");

  const response = await fetch(`${backendUrl}/api/replies`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
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

