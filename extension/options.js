const DEFAULT_SETTINGS = {
  backendUrl: "https://xleave.59et.com",
  language: "auto",
  maxCharacters: 180,
  includeContext: true,
  persona: ""
};

const form = document.querySelector("#settings-form");
const status = document.querySelector("#status");

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
