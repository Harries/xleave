const DEFAULT_SETTINGS = {
  backendUrl: "http://localhost:8787",
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

  await chrome.storage.sync.set({
    backendUrl: form.backendUrl.value.trim().replace(/\/+$/, ""),
    language: form.language.value,
    maxCharacters: Number(form.maxCharacters.value),
    includeContext: form.includeContext.checked,
    persona: form.persona.value.trim()
  });

  status.textContent = "已保存";
  window.setTimeout(() => {
    status.textContent = "";
  }, 1800);
});

async function restore() {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  form.backendUrl.value = settings.backendUrl;
  form.language.value = settings.language;
  form.maxCharacters.value = settings.maxCharacters;
  form.includeContext.checked = settings.includeContext;
  form.persona.value = settings.persona;
}

