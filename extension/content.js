const TOOL_ATTR = "data-x-ai-reply-tool";
const COMPOSER_SELECTOR =
  '[data-testid^="tweetTextarea_"][contenteditable="true"], div[role="textbox"][contenteditable="true"]';

let scanQueued = false;

const observer = new MutationObserver(queueScan);
observer.observe(document.documentElement, {
  childList: true,
  subtree: true
});

queueScan();

function queueScan() {
  if (scanQueued) return;
  scanQueued = true;

  window.requestAnimationFrame(() => {
    scanQueued = false;
    document.querySelectorAll(COMPOSER_SELECTOR).forEach(attachTool);
  });
}

function attachTool(composer) {
  if (!(composer instanceof HTMLElement) || composer.dataset.xAiReplyReady) return;

  const toolbar = findToolbar(composer);
  if (!toolbar || toolbar.querySelector(`[${TOOL_ATTR}]`)) return;

  composer.dataset.xAiReplyReady = "true";

  const root = document.createElement("span");
  root.setAttribute(TOOL_ATTR, "");
  root.className = "x-ai-reply-host";
  root.innerHTML = `
    <button class="x-ai-reply-button" type="button" aria-label="AI 生成回复">
      <span aria-hidden="true">✦</span>
      <span>AI 生成回复</span>
    </button>
  `;

  const button = root.querySelector(".x-ai-reply-button");
  const panel = document.createElement("div");
  panel.className = "x-ai-reply-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "AI 回复候选");
  panel.hidden = true;
  document.body.append(panel);

  const repositionPanel = () => {
    if (!panel.hidden) positionPanel(panel, button);
  };
  window.addEventListener("resize", repositionPanel);
  window.addEventListener("scroll", repositionPanel, true);

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    handleGenerate({ composer, button, panel });
  });

  toolbar.prepend(root);
}

function findToolbar(composer) {
  const scope =
    composer.closest('[role="dialog"]') ||
    composer.closest('[data-testid="tweetTextarea_0RichTextInputContainer"]')?.parentElement
      ?.parentElement ||
    composer.closest("form") ||
    composer.parentElement?.parentElement?.parentElement;

  return (
    scope?.querySelector('[data-testid="toolBar"]') ||
    scope?.querySelector('[role="group"]') ||
    scope
  );
}

async function handleGenerate({ composer, button, panel }) {
  if (button.disabled) return;

  setLoading(button, panel);

  try {
    const context = extractReplyContext(composer);
    const response = await chrome.runtime.sendMessage({
      type: "GENERATE_REPLIES",
      payload: context
    });

    if (!response?.ok) {
      throw new Error(response?.error || "无法生成回复");
    }

    renderCandidates(panel, composer, response.data.replies);
  } catch (error) {
    renderError(panel, error instanceof Error ? error.message : "无法生成回复");
  } finally {
    button.disabled = false;
    button.innerHTML = '<span aria-hidden="true">✦</span><span>重新生成</span>';
  }
}

function setLoading(button, panel) {
  button.disabled = true;
  button.innerHTML = '<span class="x-ai-reply-spinner" aria-hidden="true"></span><span>生成中…</span>';
  panel.innerHTML = '<div class="x-ai-reply-status">正在阅读对话并构思回复…</div>';
  showPanel(panel, button);
}

function extractReplyContext(composer) {
  const dialog = composer.closest('[role="dialog"]');
  const ownArticle = composer.closest("article");
  const candidateArticles = [
    ...(dialog?.querySelectorAll("article") || []),
    ...(ownArticle ? [ownArticle] : []),
    ...document.querySelectorAll("main article")
  ];

  const uniqueArticles = [...new Set(candidateArticles)].filter(isVisible);
  const sourceArticle = chooseSourceArticle(uniqueArticles, composer);
  const source = sourceArticle ? extractPost(sourceArticle) : null;

  const thread = uniqueArticles
    .filter((article) => article !== sourceArticle)
    .map(extractPost)
    .filter((post) => post.text && post.text !== source?.text)
    .slice(-3);

  return {
    source: source || {
      author: "",
      handle: "",
      text: "",
      url: location.href
    },
    thread,
    draft: composer.innerText.trim(),
    pageUrl: location.href
  };
}

function chooseSourceArticle(articles, composer) {
  if (articles.length === 0) return null;

  const composerRect = composer.getBoundingClientRect();
  return articles
    .map((article) => {
      const rect = article.getBoundingClientRect();
      const isAbove = rect.bottom <= composerRect.top + 80;
      const distance = isAbove
        ? composerRect.top - rect.bottom
        : Math.abs(rect.top - composerRect.top) + 1000;
      return { article, distance };
    })
    .sort((a, b) => a.distance - b.distance)[0].article;
}

function extractPost(article) {
  const userName = article.querySelector('[data-testid="User-Name"]');
  const textNodes = article.querySelectorAll('[data-testid="tweetText"]');
  const text = [...textNodes]
    .map((node) => node.innerText.trim())
    .filter(Boolean)
    .join("\n");

  const profileLink = [...(userName?.querySelectorAll('a[href^="/"]') || [])].find((link) =>
    /^\/[^/]+$/.test(link.getAttribute("href") || "")
  );
  const statusLink = article.querySelector('a[href*="/status/"]');
  const labels = userName?.innerText
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    author: labels?.find((item) => !item.startsWith("@")) || "",
    handle:
      labels?.find((item) => item.startsWith("@")) ||
      (profileLink ? `@${profileLink.getAttribute("href").slice(1)}` : ""),
    text,
    url: statusLink
      ? new URL(statusLink.getAttribute("href"), location.origin).href
      : location.href
  };
}

function isVisible(element) {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden";
}

function renderCandidates(panel, composer, replies) {
  panel.innerHTML = `
    <div class="x-ai-reply-heading">
      <strong>选择一条回复</strong>
      <button class="x-ai-reply-close" type="button" aria-label="关闭">×</button>
    </div>
    <div class="x-ai-reply-list"></div>
    <div class="x-ai-reply-hint">点击候选会填入回复框，你仍可继续修改。</div>
  `;
  showPanel(panel);

  panel.querySelector(".x-ai-reply-close").addEventListener("click", () => {
    panel.hidden = true;
  });

  const list = panel.querySelector(".x-ai-reply-list");
  replies.slice(0, 3).forEach((reply) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "x-ai-reply-candidate";

    const tone = document.createElement("span");
    tone.className = "x-ai-reply-tone";
    tone.textContent = reply.label || reply.tone || "回复";

    const text = document.createElement("span");
    text.className = "x-ai-reply-text";
    text.textContent = reply.text;

    item.append(tone, text);
    item.addEventListener("click", () => {
      fillComposer(composer, reply.text);
      panel.hidden = true;
    });
    list.append(item);
  });
}

function renderError(panel, message) {
  panel.innerHTML = `
    <div class="x-ai-reply-error">
      <strong>生成失败</strong>
      <span></span>
    </div>
  `;
  panel.querySelector("span").textContent = message;
  showPanel(panel);
}

function showPanel(panel, button) {
  if (button) panel.xAiAnchorButton = button;
  panel.hidden = false;
  positionPanel(panel, panel.xAiAnchorButton);
}

function positionPanel(panel, button) {
  if (!(button instanceof HTMLElement) || !button.isConnected) {
    panel.hidden = true;
    return;
  }

  const margin = 12;
  const gap = 10;
  const buttonRect = button.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const maxLeft = Math.max(margin, window.innerWidth - panelRect.width - margin);
  const left = Math.min(
    Math.max(margin, buttonRect.right - panelRect.width),
    maxLeft
  );

  const spaceBelow = window.innerHeight - buttonRect.bottom - margin;
  const spaceAbove = buttonRect.top - margin;
  const openAbove = panelRect.height > spaceBelow && spaceAbove > spaceBelow;
  const preferredTop = openAbove
    ? buttonRect.top - panelRect.height - gap
    : buttonRect.bottom + gap;
  const maxTop = Math.max(margin, window.innerHeight - panelRect.height - margin);
  const top = Math.min(Math.max(margin, preferredTop), maxTop);

  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(top)}px`;
}

function fillComposer(composer, text) {
  composer.focus();

  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(composer);
  selection.removeAllRanges();
  selection.addRange(range);

  const inserted = document.execCommand("insertText", false, text);
  if (!inserted) {
    composer.textContent = text;
    composer.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: text
      })
    );
  }

  composer.dispatchEvent(new Event("change", { bubbles: true }));
}
