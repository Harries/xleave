const TOOL_ATTR = "data-x-ai-reply-tool";
const COMPOSER_SELECTOR =
  '[data-testid^="tweetTextarea_"][contenteditable="true"], div[role="textbox"][contenteditable="true"]';
const REPLY_TARGET_TTL_MS = 5 * 60 * 1000;

let scanQueued = false;
let pendingReplyTarget = null;
const composerSources = new WeakMap();

document.addEventListener("click", captureReplyTarget, true);

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

function captureReplyTarget(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const article = target.closest('[data-testid="reply"]')?.closest("article");
  if (!article) return;

  const source = extractPost(article);
  if (!source.text) return;

  pendingReplyTarget = {
    article,
    source,
    capturedAt: Date.now()
  };
}

function attachTool(composer) {
  if (!(composer instanceof HTMLElement)) return;
  if (composer.dataset.xAiReplyReady) {
    syncToolMode(composer);
    return;
  }

  const toolbar = findToolbar(composer);
  if (!toolbar || toolbar.querySelector(`[${TOOL_ATTR}]`)) return;

  const mode = detectComposerMode(composer);
  composer.dataset.xAiReplyReady = "true";
  composer.dataset.xAiComposeMode = mode;

  const root = document.createElement("span");
  root.setAttribute(TOOL_ATTR, "");
  root.dataset.composeMode = mode;
  root.className = "x-ai-reply-host";
  root.innerHTML = `
    <button class="x-ai-reply-button" type="button" aria-label="${mode === "post" ? "AI 生成帖子" : "AI 生成回复"}">
      <span aria-hidden="true">✦</span>
      <span>${mode === "post" ? "AI 生成帖子" : "AI 生成回复"}</span>
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
    const activeMode = detectComposerMode(composer);
    composer.dataset.xAiComposeMode = activeMode;
    handleGenerate({ composer, button, panel, mode: activeMode });
  });

  toolbar.prepend(root);
}

function syncToolMode(composer) {
  const toolbar = findToolbar(composer);
  const root = toolbar?.querySelector(`[${TOOL_ATTR}]`);
  const button = root?.querySelector(".x-ai-reply-button");
  if (!(root instanceof HTMLElement) || !(button instanceof HTMLButtonElement)) {
    return;
  }

  const mode = detectComposerMode(composer);
  if (root.dataset.composeMode === mode) return;

  root.dataset.composeMode = mode;
  composer.dataset.xAiComposeMode = mode;
  if (!button.disabled) {
    button.setAttribute(
      "aria-label",
      mode === "post" ? "AI 生成帖子" : "AI 生成回复"
    );
    button.innerHTML = `<span aria-hidden="true">✦</span><span>${
      mode === "post" ? "AI 生成帖子" : "AI 生成回复"
    }</span>`;
  }
}

function detectComposerMode(composer) {
  const dialog = composer.closest('[role="dialog"]');
  const ownArticle = composer.closest("article");
  const dialogArticles = [...(dialog?.querySelectorAll("article") || [])];
  const dialogHasPost = dialogArticles.length > 0;
  const isStatusDetailReply =
    !dialog &&
    Boolean(composer.closest("main")) &&
    Boolean(
      findCurrentStatusArticle(
        [...document.querySelectorAll("main article")].filter(isVisible)
      )
    );
  const hasCapturedReply =
    pendingReplyTarget &&
    Date.now() - pendingReplyTarget.capturedAt <= REPLY_TARGET_TTL_MS &&
    (Boolean(ownArticle && ownArticle === pendingReplyTarget.article) ||
      dialogArticles.some((article) =>
        isSamePost(extractPost(article), pendingReplyTarget.source)
      ));

  return hasCapturedReply ||
    dialogHasPost ||
    Boolean(ownArticle) ||
    isStatusDetailReply
    ? "reply"
    : "post";
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

async function handleGenerate({ composer, button, panel, mode }) {
  if (button.disabled) return;

  panel.dataset.composeMode = mode;
  panel.setAttribute(
    "aria-label",
    mode === "post" ? "AI 帖子候选" : "AI 回复候选"
  );

  if (!isExtensionContextAvailable()) {
    renderContextInvalidated(panel, button);
    return;
  }

  setLoading(button, panel, mode);

  try {
    const context =
      mode === "post" ? extractPostContext(composer) : extractReplyContext(composer);
    const response = await chrome.runtime.sendMessage({
      type: "GENERATE_REPLIES",
      payload: context
    });

    if (!response?.ok) {
      throw new Error(
        response?.error || (mode === "post" ? "无法生成帖子" : "无法生成回复")
      );
    }

    renderCandidates(
      panel,
      composer,
      response.data.replies,
      mode,
      response.data.sources || []
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : mode === "post"
          ? "无法生成帖子"
          : "无法生成回复";
    if (isExtensionContextError(message)) {
      renderContextInvalidated(panel, button);
    } else {
      renderError(panel, message);
    }
  } finally {
    button.disabled = false;
    button.innerHTML = `<span aria-hidden="true">✦</span><span>${
      mode === "post" ? "重新生成帖子" : "重新生成回复"
    }</span>`;
  }
}

function setLoading(button, panel, mode) {
  button.disabled = true;
  button.innerHTML = '<span class="x-ai-reply-spinner" aria-hidden="true"></span><span>生成中…</span>';
  panel.innerHTML = `<div class="x-ai-reply-status">${
    mode === "post" ? "正在检索近期 AI 热点并构思帖子…" : "正在阅读对话并构思回复…"
  }</div>`;
  showPanel(panel, button);
}

function extractPostContext(composer) {
  return {
    mode: "post",
    source: {
      author: "",
      handle: "",
      text: "",
      url: location.href
    },
    thread: [],
    draft: composer.innerText.trim(),
    pageUrl: location.href
  };
}

function extractReplyContext(composer) {
  const dialog = composer.closest('[role="dialog"]');
  const ownArticle = composer.closest("article");
  const dialogArticles = [...(dialog?.querySelectorAll("article") || [])].filter(isVisible);
  const pageArticles = [...document.querySelectorAll("main article")].filter(isVisible);
  const uniqueArticles = [
    ...new Set([
      ...dialogArticles,
      ...(ownArticle ? [ownArticle] : []),
      ...pageArticles
    ])
  ];

  const lockedSource = getLockedSource(
    composer,
    dialog,
    ownArticle,
    dialogArticles
  );
  const routeArticle =
    !lockedSource && dialogArticles.length === 0 && !ownArticle
      ? findCurrentStatusArticle(pageArticles)
      : null;
  const sourceArticle = lockedSource
    ? null
    : routeArticle ||
      chooseSourceArticle(
        dialogArticles.length > 0
          ? dialogArticles
          : ownArticle
            ? [ownArticle]
            : pageArticles,
        composer
      );
  const source = lockedSource || (sourceArticle ? extractPost(sourceArticle) : null);

  const thread = uniqueArticles
    .map(extractPost)
    .filter((post) => post.text && !isSamePost(post, source))
    .slice(-3);

  return {
    mode: "reply",
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

function getLockedSource(composer, dialog, ownArticle, dialogArticles) {
  if (pendingReplyTarget) {
    if (Date.now() - pendingReplyTarget.capturedAt > REPLY_TARGET_TTL_MS) {
      pendingReplyTarget = null;
    } else {
      const matchesComposer =
        Boolean(dialog) ||
        Boolean(ownArticle && ownArticle === pendingReplyTarget.article);
      if (matchesComposer) {
        const source = pendingReplyTarget.source;
        composerSources.set(composer, source);
        pendingReplyTarget = null;
        return source;
      }
    }
  }

  const existing = composerSources.get(composer);
  if (!existing) return null;

  const scopeArticles = dialog
    ? dialogArticles
    : ownArticle
      ? [ownArticle]
      : [];
  const stillMatches = scopeArticles.some((article) =>
    isSamePost(extractPost(article), existing)
  );

  if (stillMatches) return existing;
  composerSources.delete(composer);
  return null;
}

function isSamePost(post, source) {
  if (!source) return false;
  if (post.url && source.url && post.url === source.url) return true;
  return post.text === source.text && post.handle === source.handle;
}

function findCurrentStatusArticle(articles) {
  const statusMatch = location.pathname.match(/^\/[^/]+\/status\/\d+/);
  if (!statusMatch) return null;

  return (
    articles.find((article) => {
      const post = extractPost(article);
      if (!post.url) return false;

      try {
        return new URL(post.url).pathname.startsWith(statusMatch[0]);
      } catch {
        return false;
      }
    }) || null
  );
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
    .filter((node) => node.closest("article") === article)
    .map((node) => node.innerText.trim())
    .filter(Boolean)
    .join("\n");

  const profileLink = [...(userName?.querySelectorAll('a[href^="/"]') || [])].find((link) =>
    /^\/[^/]+$/.test(link.getAttribute("href") || "")
  );
  const statusLink =
    article.querySelector('a[href*="/status/"] time')?.closest("a") ||
    article.querySelector('a[href*="/status/"]');
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
    languageHint: detectTextLanguage(text),
    url: statusLink
      ? new URL(statusLink.getAttribute("href"), location.origin).href
      : location.href
  };
}

function detectTextLanguage(text) {
  const normalized = String(text || "")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[@#][\p{L}\p{N}_-]+/gu, " ")
    .trim();
  if (!normalized) return "";

  const counts = {
    han: countMatches(normalized, /\p{Script=Han}/gu),
    kana: countMatches(normalized, /[\p{Script=Hiragana}\p{Script=Katakana}]/gu),
    hangul: countMatches(normalized, /\p{Script=Hangul}/gu),
    latin: countMatches(normalized, /\p{Script=Latin}/gu)
  };
  const total = counts.han + counts.kana + counts.hangul + counts.latin;
  if (total < 2) return "";

  if (counts.kana >= 2 && counts.kana + counts.han >= total * 0.35) {
    return "Japanese";
  }

  if (counts.hangul >= 2 && counts.hangul >= total * 0.35) {
    return "Korean";
  }

  if (counts.han >= 2 && counts.han >= total * 0.35) {
    return looksTraditionalChinese(normalized)
      ? "Traditional Chinese"
      : "Simplified Chinese";
  }

  if (counts.latin >= 2 && counts.latin >= total * 0.5) {
    return "the same Latin-script language used by the source post";
  }

  return "";
}

function countMatches(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

function looksTraditionalChinese(text) {
  return /[體臺灣廣東裏裡這會說時與為國學來對開關後發實現網頁應該問題資料軟體雲端]/u.test(
    text
  );
}

function isVisible(element) {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden";
}

function renderCandidates(panel, composer, replies, mode, sources = []) {
  const isPost = mode === "post";
  panel.innerHTML = `
    <div class="x-ai-reply-heading">
      <strong>${isPost ? "选择一条帖子" : "选择一条回复"}</strong>
      <button class="x-ai-reply-close" type="button" aria-label="关闭">×</button>
    </div>
    <div class="x-ai-reply-list"></div>
    ${
      isPost && sources.length
        ? '<div class="x-ai-reply-sources"><strong>热点来源</strong><div></div></div>'
        : ""
    }
    <div class="x-ai-reply-hint">点击候选会填入${
      isPost ? "发帖输入框" : "回复框"
    }，你仍可继续修改。</div>
  `;
  showPanel(panel);

  panel.querySelector(".x-ai-reply-close").addEventListener("click", () => {
    panel.hidden = true;
  });

  const list = panel.querySelector(".x-ai-reply-list");
  replies.slice(0, 5).forEach((reply) => {
    const replyText = removeExactDuplicate(reply.text);
    const item = document.createElement("button");
    item.type = "button";
    item.className = "x-ai-reply-candidate";

    const tone = document.createElement("span");
    tone.className = "x-ai-reply-tone";
    tone.textContent = reply.label || reply.tone || (isPost ? "帖子" : "回复");

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

  if (isPost && sources.length) {
    const sourceList = panel.querySelector(".x-ai-reply-sources div");
    sources.slice(0, 6).forEach((source) => {
      let url;
      try {
        url = new URL(source.url);
        if (!["http:", "https:"].includes(url.protocol)) return;
      } catch {
        return;
      }

      const link = document.createElement("a");
      link.href = url.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = source.title || url.hostname;
      sourceList.append(link);
    });
  }
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

function renderContextInvalidated(panel, button) {
  panel.innerHTML = `
    <div class="x-ai-reply-error x-ai-reply-context-error">
      <strong>插件已更新</strong>
      <span>当前 X 页面仍在使用旧版插件，请刷新页面后再试。</span>
      <button class="x-ai-reply-refresh" type="button">刷新 X 页面</button>
    </div>
  `;
  panel.querySelector(".x-ai-reply-refresh").addEventListener("click", () => {
    window.location.reload();
  });
  showPanel(panel, button);
}

function isExtensionContextAvailable() {
  try {
    return Boolean(chrome?.runtime?.id);
  } catch {
    return false;
  }
}

function isExtensionContextError(message) {
  return /extension context invalidated|receiving end does not exist|message port closed/i.test(
    message
  );
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
  const viewportBottom = viewportTop + viewportHeight;

  const buttonRect = button.getBoundingClientRect();
  const availableAbove = Math.max(
    0,
    buttonRect.top - viewportTop - gap - margin
  );
  const availableBelow = Math.max(
    0,
    viewportBottom - buttonRect.bottom - gap - margin
  );
  const isPost = panel.dataset.composeMode === "post";
  const placeAbove = isPost
    ? availableBelow < 220 && availableAbove > availableBelow
    : availableAbove >= 220 || availableAbove >= availableBelow;
  const availableHeight = placeAbove ? availableAbove : availableBelow;

  panel.style.maxHeight = `${Math.max(
    120,
    Math.min(viewportHeight - margin * 2, availableHeight)
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
  if (placeAbove) {
    panel.style.top = `${Math.round(buttonRect.top - gap)}px`;
    panel.style.transform = "translateY(-100%)";
    panel.style.transformOrigin = "bottom right";
  } else {
    panel.style.top = `${Math.round(buttonRect.bottom + gap)}px`;
    panel.style.transform = "none";
    panel.style.transformOrigin = "top right";
  }
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
