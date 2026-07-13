import { isSameOriginRequest } from "./admin.js";
import { AI_PROVIDERS } from "./ai-provider.js";
import {
  isSecretConfigured,
  sessionTtlSeconds,
  signSession,
  verifySession
} from "./crypto.js";
import { getClientIp } from "./ip-access.js";
import {
  authenticateUser,
  changePassword,
  clearAiKey,
  getAccountProfile,
  isUserStoreConfigured,
  registerUser,
  rotateUserToken,
  setUserIps,
  updateAiSettings,
  updatePreferences
} from "./user-store.js";
import {
  escapeHtml,
  page,
  parseCookies,
  renderAppShell,
  serializeCookie
} from "./web-utils.js";

const SESSION_COOKIE = "xleave_user";

export function registerUserCenter(app) {
  app.use(["/login", "/register", "/logout", "/account"], (_request, response, next) => {
    response.set({
      "Cache-Control": "no-store",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY"
    });
    next();
  });

  app.get("/register", (request, response) => {
    if (getSessionUserId(request)) return response.redirect(303, "/account");
    return response.send(renderRegister());
  });

  app.post("/register", requireSameOrigin, async (request, response) => {
    if (!ready(response)) return undefined;
    try {
      const result = await registerUser({
        username: request.body?.username,
        password: request.body?.password
      });
      setSession(response, result.user.id);
      return renderAccountResponse(response, result.user.id, {
        notice: "注册成功，请妥善保存下方访问 Token。",
        secret: result.token
      });
    } catch (error) {
      return response.status(400).send(renderRegister(publicMessage(error)));
    }
  });

  app.get("/login", (request, response) => {
    if (getSessionUserId(request)) return response.redirect(303, "/account");
    return response.send(renderLogin());
  });

  app.post("/login", requireSameOrigin, async (request, response) => {
    if (!ready(response)) return undefined;
    try {
      const user = await authenticateUser(
        request.body?.username,
        request.body?.password
      );
      if (!user) {
        return response.status(401).send(renderLogin("用户名或密码不正确"));
      }
      setSession(response, user.id);
      return response.redirect(303, "/account");
    } catch (error) {
      return response.status(401).send(renderLogin(publicMessage(error)));
    }
  });

  app.post("/logout", requireLogin, requireSameOrigin, (_request, response) => {
    clearSession(response);
    return response.redirect(303, "/login");
  });

  app.get("/account", requireLogin, async (_request, response) => {
    return renderAccountResponse(response, response.locals.accountId, "token");
  });

  app.get("/account/ai", requireLogin, async (_request, response) => {
    return renderAccountResponse(response, response.locals.accountId, "ai");
  });

  app.post("/account/ai", requireLogin, requireSameOrigin, async (request, response) => {
    try {
      await updateAiSettings(response.locals.accountId, {
        provider: request.body?.provider,
        apiKey: request.body?.apiKey,
        model: request.body?.model
      });
      return renderAccountResponse(response, response.locals.accountId, "ai", {
        notice: "AI 设置已保存。"
      });
    } catch (error) {
      return renderAccountResponse(response, response.locals.accountId, "ai", {
        error: publicMessage(error)
      });
    }
  });

  app.post(
    "/account/ai/clear",
    requireLogin,
    requireSameOrigin,
    async (_request, response) => {
      try {
        await clearAiKey(response.locals.accountId);
        return renderAccountResponse(response, response.locals.accountId, "ai", {
          notice: "已清除已保存的 AI Key。"
        });
      } catch (error) {
        return renderAccountResponse(response, response.locals.accountId, "ai", {
          error: publicMessage(error)
        });
      }
    }
  );

  app.get("/account/prompt", requireLogin, async (_request, response) => {
    return renderAccountResponse(response, response.locals.accountId, "prompt");
  });

  app.post("/account/prompt", requireLogin, requireSameOrigin, async (request, response) => {
    try {
      await updatePreferences(response.locals.accountId, {
        persona: request.body?.persona,
        language: request.body?.language,
        maxCharacters: request.body?.maxCharacters,
        includeContext: request.body?.includeContext === "on"
      });
      return renderAccountResponse(response, response.locals.accountId, "prompt", {
        notice: "生成偏好已保存。"
      });
    } catch (error) {
      return renderAccountResponse(response, response.locals.accountId, "prompt", {
        error: publicMessage(error)
      });
    }
  });

  app.post(
    "/account/token/rotate",
    requireLogin,
    requireSameOrigin,
    async (_request, response) => {
      try {
        const result = await rotateUserToken(response.locals.accountId);
        return renderAccountResponse(response, response.locals.accountId, "token", {
          notice: "访问 Token 已轮换，旧 Token 立即失效。",
          secret: result.token
        });
      } catch (error) {
        return renderAccountResponse(response, response.locals.accountId, "token", {
          error: publicMessage(error)
        });
      }
    }
  );

  app.get("/account/ips", requireLogin, async (request, response) => {
    return renderAccountResponse(response, response.locals.accountId, "ips", {
      clientIp: getClientIp(request)
    });
  });

  app.post("/account/ips", requireLogin, requireSameOrigin, async (request, response) => {
    try {
      await setUserIps(response.locals.accountId, request.body?.allowedIps);
      return renderAccountResponse(response, response.locals.accountId, "ips", {
        notice: "IP 白名单已更新。",
        clientIp: getClientIp(request)
      });
    } catch (error) {
      return renderAccountResponse(response, response.locals.accountId, "ips", {
        error: publicMessage(error),
        clientIp: getClientIp(request)
      });
    }
  });

  app.get("/account/password", requireLogin, async (_request, response) => {
    return renderAccountResponse(response, response.locals.accountId, "password");
  });

  app.post(
    "/account/password",
    requireLogin,
    requireSameOrigin,
    async (request, response) => {
      try {
        await changePassword(
          response.locals.accountId,
          request.body?.currentPassword,
          request.body?.newPassword
        );
        return renderAccountResponse(response, response.locals.accountId, "password", {
          notice: "密码已修改。"
        });
      } catch (error) {
        return renderAccountResponse(response, response.locals.accountId, "password", {
          error: publicMessage(error)
        });
      }
    }
  );
}

// ---------------------------------------------------------------------------
// Middleware & session helpers
// ---------------------------------------------------------------------------

function requireLogin(request, response, next) {
  const accountId = getSessionUserId(request);
  if (!accountId) {
    if (request.method === "GET") return response.redirect(303, "/login");
    return response.status(401).send(renderLogin("登录已失效，请重新登录"));
  }
  response.locals.accountId = accountId;
  return next();
}

function requireSameOrigin(request, response, next) {
  if (!isSameOriginRequest(request)) {
    return response.status(403).send("Forbidden");
  }
  return next();
}

function ready(response) {
  if (!isUserStoreConfigured()) {
    response.status(503).send(renderLogin("后端尚未配置 Neon 数据库（DATABASE_URL）"));
    return false;
  }
  if (!isSecretConfigured()) {
    response.status(503).send(renderLogin("后端尚未配置 XLEAVE_SECRET_KEY"));
    return false;
  }
  return true;
}

function getSessionUserId(request) {
  if (!isSecretConfigured()) return null;
  const cookie = parseCookies(request.get("cookie"))[SESSION_COOKIE];
  const session = verifySession(cookie);
  return session?.id || null;
}

function setSession(response, userId) {
  response.setHeader(
    "Set-Cookie",
    serializeCookie(SESSION_COOKIE, signSession(userId), {
      maxAge: sessionTtlSeconds,
      path: "/"
    })
  );
}

function clearSession(response) {
  response.setHeader(
    "Set-Cookie",
    serializeCookie(SESSION_COOKIE, "", { maxAge: 0, path: "/" })
  );
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

async function renderAccountResponse(response, accountId, activeKey, state = {}) {
  response.set("Cache-Control", "no-store");
  try {
    const profile = await getAccountProfile(accountId);
    return response
      .status(state.error ? 400 : 200)
      .send(renderAccount(profile, activeKey, state));
  } catch (error) {
    return response.status(500).send(renderLogin(publicMessage(error)));
  }
}

function authShell(title, body) {
  return page(
    title,
    `
      <main class="login-card">
        <h1>XLeave 用户中心</h1>
        ${body}
      </main>
    `
  );
}

function renderRegister(error = "") {
  return authShell(
    "注册",
    `
      <p>创建账号后即可自助管理访问 Token、设置自己的 AI Key 和提示词。</p>
      ${error ? `<div class="alert error">${escapeHtml(error)}</div>` : ""}
      <form method="post" action="/register" class="grid-form">
        <label>用户名
          <input name="username" required pattern="[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}"
            placeholder="3–64 位字母、数字、下划线或连字符" autocomplete="username">
        </label>
        <label>密码
          <input name="password" type="password" required minlength="8"
            placeholder="至少 8 位" autocomplete="new-password">
        </label>
        <button type="submit">注册</button>
      </form>
      <p class="field-hint">已有账号？<a href="/login">去登录</a></p>
    `
  );
}

function renderLogin(error = "") {
  return authShell(
    "登录",
    `
      <p>登录后进入个人中心。</p>
      ${error ? `<div class="alert error">${escapeHtml(error)}</div>` : ""}
      <form method="post" action="/login" class="grid-form">
        <label>用户名
          <input name="username" required autocomplete="username" autofocus>
        </label>
        <label>密码
          <input name="password" type="password" required autocomplete="current-password">
        </label>
        <button type="submit">登录</button>
      </form>
      <p class="field-hint">还没有账号？<a href="/register">去注册</a></p>
    `
  );
}

const ACCOUNT_NAV = [
  { key: "token", href: "/account", icon: "🔑", label: "访问 Token" },
  { key: "ai", href: "/account/ai", icon: "🤖", label: "AI Token" },
  { key: "prompt", href: "/account/prompt", icon: "✍️", label: "生成偏好" },
  { key: "ips", href: "/account/ips", icon: "🌐", label: "IP 白名单" },
  { key: "password", href: "/account/password", icon: "🔒", label: "修改密码" }
];

const ACCOUNT_SECTIONS = {
  token: sectionToken,
  ai: sectionAi,
  prompt: sectionPrompt,
  ips: sectionIps,
  password: sectionPassword
};

function renderAccount(profile, activeKey = "token", { notice = "", error = "", secret = "", clientIp = "" } = {}) {
  const active = ACCOUNT_NAV.find((item) => item.key === activeKey) || ACCOUNT_NAV[0];
  const nav = ACCOUNT_NAV.map((item) => ({
    href: item.href,
    icon: item.icon,
    label: item.label,
    active: item.key === active.key
  }));
  const footer = `
    <form method="post" action="/logout">
      <button type="submit" class="app-nav-item">
        <span class="app-nav-icon">⎋</span><span class="label">退出登录</span>
      </button>
    </form>`;

  const main = `
      <header>
        <div>
          <h1>${escapeHtml(active.label)}</h1>
          <p>账号：<strong>${escapeHtml(profile.id)}</strong></p>
        </div>
      </header>
      ${notice ? `<div class="alert success">${escapeHtml(notice)}</div>` : ""}
      ${error ? `<div class="alert error">${escapeHtml(error)}</div>` : ""}
      ${
        secret
          ? `<div class="secret"><strong>访问 Token 仅显示这一次：</strong><code>${escapeHtml(secret)}</code><button type="button" data-copy="${escapeHtml(secret)}">复制</button></div>`
          : ""
      }
      ${(ACCOUNT_SECTIONS[active.key] || sectionToken)(profile, clientIp)}

      <script>
        document.addEventListener("click", async (event) => {
          const value = event.target?.dataset?.copy;
          if (!value) return;
          await navigator.clipboard.writeText(value);
          event.target.textContent = "已复制";
        });
      </script>
  `;

  return page(
    `${active.label} · 个人中心`,
    renderAppShell({ subtitle: "用户中心", nav, footer, main })
  );
}

function sectionToken(profile) {
  return `
      <section>
        <h2>访问 Token</h2>
        <div class="usage-stats">
          <div><strong>···${escapeHtml(profile.tokenHint || "?")}</strong><span>当前 Token 尾号</span></div>
          <div><strong>${formatCount(profile.usageCount)}</strong><span>累计 AI 使用次数</span></div>
        </div>
        <p class="field-hint">把访问 Token 填入 Chrome 插件设置即可使用。轮换后旧 Token 立即失效。</p>
        <form method="post" action="/account/token/rotate"
          onsubmit="return confirm('轮换后旧 Token 立即失效，确认继续？')">
          <button type="submit">轮换 Token</button>
        </form>
      </section>`;
}

function sectionAi(profile) {
  const providerOptions = Object.entries(AI_PROVIDERS)
    .map(
      ([value, config]) =>
        `<option value="${value}" ${profile.aiProvider === value ? "selected" : ""}>${escapeHtml(config.label)}</option>`
    )
    .join("");

  return `
      <section>
        <h2>AI Token（自带 Key）</h2>
        <p class="field-hint">
          当前状态：${profile.hasAiKey ? "<strong>已设置</strong>" : "<strong>未设置</strong>（未设置将无法生成）"}。
          Key 经 AES-256-GCM 加密后保存，不会明文回显。
        </p>
        <form method="post" action="/account/ai" class="grid-form">
          <label>服务商
            <select name="provider">${providerOptions}</select>
          </label>
          <label>模型（可选，留空使用默认）
            <input name="model" value="${escapeHtml(profile.aiModel)}"
              placeholder="如 gpt-5.4-mini 或 deepseek-chat">
          </label>
          <label>API Key
            <input name="apiKey" type="password" autocomplete="off" spellcheck="false"
              placeholder="${profile.hasAiKey ? "留空则保留当前 Key" : "粘贴你的 OpenAI / DeepSeek API Key"}">
          </label>
          <button type="submit">保存 AI 设置</button>
        </form>
        <p class="field-hint">注意：DeepSeek 暂不支持联网发帖模式，发帖请使用 OpenAI。</p>
        ${
          profile.hasAiKey
            ? `<form method="post" action="/account/ai/clear" onsubmit="return confirm('确认清除已保存的 AI Key？')"><button class="danger">清除 AI Key</button></form>`
            : ""
        }
      </section>`;
}

function sectionPrompt(profile) {
  const languages = [
    ["auto", "自动判断"],
    ["zh-CN", "简体中文"],
    ["zh-TW", "繁体中文"],
    ["en", "English"],
    ["ja", "日本語"]
  ];
  const languageOptions = languages
    .map(
      ([value, label]) =>
        `<option value="${value}" ${profile.prefLanguage === value ? "selected" : ""}>${escapeHtml(label)}</option>`
    )
    .join("");

  return `
      <section>
        <h2>生成偏好</h2>
        <p class="field-hint">这些偏好在后台统一管理，插件端不再需要配置。</p>
        <form method="post" action="/account/prompt" class="grid-form">
          <label>生成语言
            <select name="language">${languageOptions}</select>
          </label>
          <label>最大字符数
            <input name="maxCharacters" type="number" min="30" max="500"
              value="${escapeHtml(String(profile.prefMaxCharacters || 180))}">
          </label>
          <label class="checkbox-row">
            <input type="checkbox" name="includeContext" ${profile.prefIncludeContext ? "checked" : ""}>
            回复时包含最多 3 条可见对话上下文
          </label>
          <label>个人表达风格（可选）
            <textarea name="persona" rows="4"
              placeholder="例如：我是独立开发者，表达简洁、真诚，不使用夸张营销词。">${escapeHtml(profile.persona)}</textarea>
          </label>
          <button type="submit">保存生成偏好</button>
        </form>
      </section>`;
}

function sectionIps(profile, clientIp = "") {
  return `
      <section>
        <h2>公网 IP 白名单（可选）</h2>
        <form method="post" action="/account/ips" class="grid-form">
          <label>允许访问的公网 IP
            <textarea name="allowedIps" rows="2"
              placeholder="留空表示不限制。多个用逗号或空格分隔">${escapeHtml((profile.allowedIps || []).join(", "))}</textarea>
          </label>
          <button type="submit">保存 IP</button>
        </form>
        <p class="field-hint">当前检测到的公网 IP：<code>${escapeHtml(clientIp || "未识别")}</code>。留空则任意 IP 均可用你的 Token 访问。</p>
      </section>`;
}

function sectionPassword() {
  return `
      <section>
        <h2>修改密码</h2>
        <form method="post" action="/account/password" class="grid-form">
          <label>当前密码
            <input name="currentPassword" type="password" required autocomplete="current-password">
          </label>
          <label>新密码
            <input name="newPassword" type="password" required minlength="8" autocomplete="new-password">
          </label>
          <button type="submit">修改密码</button>
        </form>
      </section>`;
}

function formatCount(value) {
  const count = Number(value || 0);
  return Number.isFinite(count) ? count.toLocaleString("zh-CN") : "0";
}

function publicMessage(error) {
  return error instanceof Error ? error.message : "操作失败";
}
