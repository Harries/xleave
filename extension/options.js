const DEFAULT_BACKEND_URL = "https://xleave.59et.com";

const form = document.querySelector("#settings-form");
const status = document.querySelector("#status");

restore();

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  await chrome.storage.local.set({
    apiToken: form.apiToken.value.trim()
  });

  status.textContent = "已保存";
  window.setTimeout(() => {
    status.textContent = "";
  }, 1800);
});

async function restore() {
  const [settings, localSettings] = await Promise.all([
    chrome.storage.sync.get({ backendUrl: DEFAULT_BACKEND_URL }),
    chrome.storage.local.get({ apiToken: "" })
  ]);
  form.apiToken.value = localSettings.apiToken;
  updateAccountLinks(settings.backendUrl || DEFAULT_BACKEND_URL);
}

function updateAccountLinks(backendUrl) {
  const base = String(backendUrl || DEFAULT_BACKEND_URL)
    .trim()
    .replace(/\/+$/, "");
  const href = base ? `${base}/account` : "#";
  for (const id of ["account-link", "account-link-2"]) {
    const link = document.querySelector(`#${id}`);
    if (link) link.href = href;
  }
}
