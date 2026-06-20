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
  window.visualViewport?.addEventListener("resize", repositionPanel);
  window.visualViewport?.addEventListener("scroll", repositionPanel);

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
    const replyText = removeExactDuplicate(reply.text);
    const item = document.createElement("button");
    item.type = "button";
    item.className = "x-ai-reply-candidate";

    const tone = document.createElement("span");
    tone.className = "x-ai-reply-tone";
    tone.textContent = reply.label || reply.tone || "回复";

    const text = document.createElement("span");
    text.className = "x-ai-reply-text";
    text.textContent = replyText;

    item.append(tone, text);
    item.addEventListener("click", async () => {
      if (item.disabled || composer.dataset.xAiReplyFilling === "true") return;

      item.disabled = true;
      try {
        await fillComposer(composer, replyText);
        panel.hidden = true;
      } finally {
        item.disabled = false;
      }
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
  const viewport = window.visualViewport;
  const viewportLeft = viewport?.offsetLeft || 0;
  const viewportTop = viewport?.offsetTop || 0;
  const viewportWidth = viewport?.width || window.innerWidth;
  const viewportHeight = viewport?.height || window.innerHeight;
  const viewportRight = viewportLeft + viewportWidth;

  const buttonRect = button.getBoundingClientRect();
  const availableAbove = Math.max(80, buttonRect.top - viewportTop - gap - margin);
  panel.style.maxHeight = `${Math.min(
    viewportHeight - margin * 2,
    availableAbove
  )}px`;

  const panelRect = panel.getBoundingClientRect();
  const minLeft = viewportLeft + margin;
  const maxLeft = Math.max(
    minLeft,
    viewportRight - panelRect.width - margin
  );
  const left = Math.min(
    Math.max(minLeft, buttonRect.right - panelRect.width),
    maxLeft
  );

  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(buttonRect.top - gap)}px`;
  panel.style.transform = "translateY(-100%)";
}

async function fillComposer(composer, text) {
  const cleanText = removeExactDuplicate(text);
  composer.dataset.xAiReplyFilling = "true";

  try {
    await insertTextThroughEditor(composer, cleanText);
    await nextPaint();

    const actualText = composer.innerText.trim();
    if (actualText !== cleanText && removeExactDuplicate(actualText) === cleanText) {
      await insertTextThroughEditor(composer, cleanText);
      await nextPaint();
    }

    if (isReplyButtonDisabled(composer)) {
      await insertTextWithExecCommand(composer, cleanText);
      await nextPaint();
    }
  } finally {
    delete composer.dataset.xAiReplyFilling;
  }
}

async function insertTextThroughEditor(composer, text) {
  composer.focus();
  selectComposerContents(composer);
  document.dispatchEvent(new Event("selectionchange"));
  await nextPaint();

  try {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", text);
    const pasteEvent = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      composed: true,
      clipboardData
    });
    const handledByEditor = !composer.dispatchEvent(pasteEvent);

    if (handledByEditor) return;
  } catch (error) {
    console.debug("[X AI Reply] Draft.js paste fallback", error);
  }

  await insertTextWithExecCommand(composer, text);
}

async function insertTextWithExecCommand(composer, text) {
  composer.focus();
  selectComposerContents(composer);
  document.dispatchEvent(new Event("selectionchange"));
  await nextPaint();

  document.execCommand("insertText", false, text);
  placeCaretAtEnd(composer);
}

function isReplyButtonDisabled(composer) {
  const scope =
    composer.closest('[role="dialog"]') ||
    composer.closest("form") ||
    composer.closest("article") ||
    composer.parentElement?.parentElement?.parentElement;
  const replyButton =
    scope?.querySelector('[data-testid="tweetButtonInline"]') ||
    scope?.querySelector('[data-testid="tweetButton"]');

  if (!(replyButton instanceof HTMLElement)) return false;
  return (
    replyButton.getAttribute("aria-disabled") === "true" ||
    replyButton.hasAttribute("disabled")
  );
}

function selectComposerContents(composer) {
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(composer);
  selection.removeAllRanges();
  selection.addRange(range);
}

function placeCaretAtEnd(composer) {
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(composer);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function removeExactDuplicate(value) {
  const text = String(value || "").trim();
  const characters = [...text];
  if (characters.length < 12) return text;

  const midpoint = Math.floor(characters.length / 2);
  for (let split = midpoint - 2; split <= midpoint + 2; split += 1) {
    if (split <= 0 || split >= characters.length) continue;

    const first = characters.slice(0, split).join("").trim();
    const second = characters.slice(split).join("").trim();
    if (first.length >= 6 && first === second) return first;
  }

  return text;
}

function nextPaint() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(resolve);
    });
  });
}
