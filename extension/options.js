const DEFAULT_SETTINGS = {
  backendUrl: "https://xleave.59et.com",
  language: "auto",
  maxCharacters: 180,
  includeContext: true,
  persona: ""
};

const form = document.querySelector("#settings-form");
const status = document.querySelector("#status");
const ipResult = document.querySelector("#ip-result");

restore();

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  await Promise.all([
    chrome.storage.sync.set({
      backendUrl: form.backendUrl.value.trim().replace(/\/+$/, ""),
      language: form.language.value,
      maxCharacters: Number(form.maxCharacters.value),
      includeContext: form.includeContext.checked,
      persona: form.persona.value.trim()
    }),
    chrome.storage.local.set({
      apiToken: form.apiToken.value.trim()
    })
  ]);

  status.textContent = "已保存";
  window.setTimeout(() => {
    status.textContent = "";
  }, 1800);
});

document.querySelector("#check-ip").addEventListener("click", async () => {
  ipResult.textContent = "检测中…";

  try {
    const backendUrl = form.backendUrl.value.trim().replace(/\/+$/, "");
    const response = await fetch(`${backendUrl}/ip`, {
      cache: "no-store"
    });
    const data = await response.json();
    if (!response.ok || !data.ip) throw new Error("无法识别公网 IP");

    ipResult.textContent = data.ip;
  } catch (error) {
    ipResult.textContent =
      error instanceof Error ? error.message : "公网 IP 检测失败";
  }
});

async function restore() {
  const [settings, localSettings] = await Promise.all([
    chrome.storage.sync.get(DEFAULT_SETTINGS),
    chrome.storage.local.get({ apiToken: "" })
  ]);
  form.backendUrl.value = settings.backendUrl;
  form.apiToken.value = localSettings.apiToken;
  form.language.value = settings.language;
  form.maxCharacters.value = settings.maxCharacters;
  form.includeContext.checked = settings.includeContext;
  form.persona.value = settings.persona;
}
