import { createHmac } from "node:crypto";

import {
  createUser,
  deleteUser,
  isUserStoreConfigured,
  listUsers,
  rotateUserToken,
  setUserEnabled,
  updateUserIps
} from "./user-store.js";
import {
  escapeHtml,
  page,
  parseCookies,
  safeEqual,
  serializeCookie
} from "./web-utils.js";

const SESSION_COOKIE = "xleave_admin";
const SESSION_TTL_SECONDS = 12 * 60 * 60;

export function registerAdminRoutes(app) {
  app.use("/admin", (_request, response, next) => {
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

  app.get("/admin", async (request, response) => {
    if (!isAdminAuthenticated(request)) {
      return response.status(401).send(renderLogin());
    }
    return renderDashboardResponse(response);
  });

  app.post("/admin/login", (request, response) => {
    const configuredToken = process.env.XLEAVE_ADMIN_TOKEN?.trim();
    const providedToken = String(request.body?.adminToken || "").trim();
    if (
      !configuredToken ||
      configuredToken.length < 32 ||
      !safeEqual(providedToken, configuredToken)
    ) {
      return response.status(401).send(renderLogin("管理员密钥无效"));
    }

    response.setHeader(
      "Set-Cookie",
      serializeCookie(SESSION_COOKIE, createSession(configuredToken), {
        maxAge: SESSION_TTL_SECONDS,
        path: "/admin"
      })
    );
    return response.redirect(303, "/admin");
  });

  app.post("/admin/logout", requireAdmin, requireSameOrigin, (_request, response) => {
    response.setHeader(
      "Set-Cookie",
      serializeCookie(SESSION_COOKIE, "", { maxAge: 0, path: "/admin" })
    );
    response.redirect(303, "/admin");
  });

  app.post("/admin/users", requireAdmin, requireSameOrigin, async (request, response) => {
    try {
      const result = await createUser({
        id: request.body?.id,
        allowedIps: request.body?.allowedIps,
        token: request.body?.token
      });
      return renderDashboardResponse(response, {
        notice: `用户 ${result.user.id} 已创建`,
        secret: result.token
      });
    } catch (error) {
      return renderDashboardResponse(response, {
        error: publicMessage(error)
      });
    }
  });

  app.post(
    "/admin/users/:id/ips",
    requireAdmin,
    requireSameOrigin,
    async (request, response) => {
      try {
        await updateUserIps(request.params.id, request.body?.allowedIps);
        return renderDashboardResponse(response, {
          notice: `用户 ${request.params.id} 的 IP 已更新`
        });
      } catch (error) {
        return renderDashboardResponse(response, {
          error: publicMessage(error)
        });
      }
    }
  );

  app.post(
    "/admin/users/:id/toggle",
    requireAdmin,
    requireSameOrigin,
    async (request, response) => {
      try {
        const enabled = request.body?.enabled === "true";
        await setUserEnabled(request.params.id, enabled);
        return renderDashboardResponse(response, {
          notice: `用户 ${request.params.id} 已${enabled ? "启用" : "停用"}`
        });
      } catch (error) {
        return renderDashboardResponse(response, {
          error: publicMessage(error)
        });
      }
    }
  );

  app.post(
    "/admin/users/:id/rotate",
    requireAdmin,
    requireSameOrigin,
    async (request, response) => {
      try {
        const result = await rotateUserToken(
          request.params.id,
          request.body?.token
        );
        return renderDashboardResponse(response, {
          notice: `用户 ${request.params.id} 的 Token 已轮换`,
          secret: result.token
        });
      } catch (error) {
        return renderDashboardResponse(response, {
          error: publicMessage(error)
        });
      }
    }
  );

  app.post(
    "/admin/users/:id/delete",
    requireAdmin,
    requireSameOrigin,
    async (request, response) => {
      try {
        await deleteUser(request.params.id);
        return renderDashboardResponse(response, {
          notice: `用户 ${request.params.id} 已删除`
        });
      } catch (error) {
        return renderDashboardResponse(response, {
          error: publicMessage(error)
        });
      }
    }
  );
}

function requireAdmin(request, response, next) {
  if (!isAdminAuthenticated(request)) {
    return response.status(401).send(renderLogin("登录已失效"));
  }
  return next();
}

function requireSameOrigin(request, response, next) {
  if (!isSameOriginRequest(request)) {
    console.warn("[X AI Reply] rejected admin origin", {
      origin: request.get("origin") || null,
      referer: request.get("referer") || null,
      host: request.get("host") || null,
      forwardedHost: request.get("x-forwarded-host") || null
    });
    return response.status(403).send("Forbidden");
  }
  return next();
}

export function isSameOriginRequest(request) {
  const fetchSite = request.get("sec-fetch-site");
  if (fetchSite === "cross-site") return false;

  const source = request.get("origin") || request.get("referer");
  const expectedHosts = getExpectedAdminHosts(request);

  if (!source || source === "null") {
    return (
      fetchSite === "same-origin" &&
      requestHostIsExpected(request, expectedHosts)
    );
  }

  try {
    const sourceHost = new URL(source).host.toLowerCase();
    return expectedHosts.has(sourceHost);
  } catch {
    return false;
  }
}

function requestHostIsExpected(request, expectedHosts) {
  const forwardedHost = request.get("x-forwarded-host")?.split(",")[0]?.trim();
  const directHost = request.get("host")?.trim();
  return [forwardedHost, directHost]
    .filter(Boolean)
    .some((host) => expectedHosts.has(host.toLowerCase()));
}

function getExpectedAdminHosts(request) {
  const hosts = new Set();
  const forwardedHost = request.get("x-forwarded-host");
  const directHost = request.get("host");
  const publicOrigin =
    process.env.XLEAVE_PUBLIC_ORIGIN || "https://xleave.59et.com";

  if (forwardedHost) {
    for (const host of forwardedHost.split(",")) {
      if (host.trim()) hosts.add(host.trim().toLowerCase());
    }
  }
  if (directHost) hosts.add(directHost.trim().toLowerCase());

  try {
    hosts.add(new URL(publicOrigin).host.toLowerCase());
  } catch {
    // Invalid optional configuration is ignored; proxy and Host remain usable.
  }

  return hosts;
}

async function renderDashboardResponse(response, state = {}) {
  response.set("Cache-Control", "no-store");
  try {
    const users = isUserStoreConfigured() ? await listUsers() : [];
    return response
      .status(state.error ? 400 : 200)
      .send(renderDashboard({ ...state, users }));
  } catch (error) {
    return response.status(500).send(
      renderDashboard({
        users: [],
        error: publicMessage(error)
      })
    );
  }
}

function renderLogin(error = "") {
  return page(
    "管理员登录",
    `
      <main class="login-card">
        <h1>XLeave 管理后台</h1>
        <p>使用 Vercel 环境变量 <code>XLEAVE_ADMIN_TOKEN</code> 登录。</p>
        ${error ? `<div class="alert error">${escapeHtml(error)}</div>` : ""}
        <form method="post" action="/admin/login">
          <label>管理员密钥
            <input type="password" name="adminToken" required autofocus autocomplete="current-password">
          </label>
          <button type="submit">登录</button>
        </form>
      </main>
    `
  );
}

function renderDashboard({ users, notice = "", error = "", secret = "" }) {
  const configured = isUserStoreConfigured();
  return page(
    "用户管理",
    `
      <header>
        <div>
          <h1>XLeave 用户管理</h1>
          <p>创建用户、分配 Token 和公网 IP 白名单。</p>
        </div>
        <form method="post" action="/admin/logout"><button class="secondary">退出</button></form>
      </header>
      ${notice ? `<div class="alert success">${escapeHtml(notice)}</div>` : ""}
      ${error ? `<div class="alert error">${escapeHtml(error)}</div>` : ""}
      ${
        secret
          ? `<div class="secret"><strong>Token 仅显示这一次：</strong><code>${escapeHtml(secret)}</code><button type="button" data-copy="${escapeHtml(secret)}">复制</button></div>`
          : ""
      }
      ${
        configured
          ? ""
          : `<div class="alert error">尚未配置 Neon。请在 Vercel 设置 <code>DATABASE_URL</code>。</div>`
      }
      <section>
        <h2>新建用户</h2>
        <form method="post" action="/admin/users" class="grid-form">
          <label>用户 ID
            <input name="id" required pattern="[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}" placeholder="例如 alice">
          </label>
          <label>公网 IP
            <textarea name="allowedIps" required rows="2" placeholder="203.0.113.10, 2001:db8::10"></textarea>
          </label>
          <label>自定义 Token（可选）
            <input name="token" minlength="32" placeholder="留空自动生成 64 位 Token">
          </label>
          <button type="submit" ${configured ? "" : "disabled"}>创建用户</button>
        </form>
      </section>
      <section>
        <h2>现有用户 <span class="count">${users.length}</span></h2>
        <div class="users">
          ${
            users.length
              ? users.map(renderUser).join("")
              : '<p class="empty">暂无 Neon 用户。</p>'
          }
        </div>
      </section>
      <script>
        document.addEventListener("click", async (event) => {
          const value = event.target?.dataset?.copy;
          if (!value) return;
          await navigator.clipboard.writeText(value);
          event.target.textContent = "已复制";
        });
      </script>
    `
  );
}

function renderUser(user) {
  const id = encodeURIComponent(user.id);
  return `
    <article class="user-card">
      <div class="user-head">
        <div>
          <h3>${escapeHtml(user.id)}</h3>
          <span class="badge ${user.enabled === false ? "off" : ""}">${user.enabled === false ? "已停用" : "启用中"}</span>
        </div>
        <small>Token 尾号 ···${escapeHtml(user.tokenHint || "未知")}</small>
      </div>
      <div class="usage-stats">
        <div><strong>${formatCount(user.usageCount)}</strong><span>累计 AI 使用次数</span></div>
        <div><strong>${escapeHtml(formatUsageDate(user.lastUsedAt))}</strong><span>最后使用时间</span></div>
      </div>
      <form method="post" action="/admin/users/${id}/ips">
        <label>公网 IP 白名单
          <textarea name="allowedIps" required rows="2">${escapeHtml(user.allowedIps.join(", "))}</textarea>
        </label>
        <button type="submit">保存 IP</button>
      </form>
      <div class="actions">
        <form method="post" action="/admin/users/${id}/rotate">
          <input name="token" minlength="32" placeholder="留空自动生成新 Token">
          <button type="submit">轮换 Token</button>
        </form>
        <form method="post" action="/admin/users/${id}/toggle">
          <input type="hidden" name="enabled" value="${user.enabled === false ? "true" : "false"}">
          <button class="secondary">${user.enabled === false ? "启用" : "停用"}</button>
        </form>
        <form method="post" action="/admin/users/${id}/delete" onsubmit="return confirm('确认删除 ${escapeHtml(user.id)}？')">
          <button class="danger">删除</button>
        </form>
      </div>
    </article>
  `;
}

function isAdminAuthenticated(request) {
  const adminToken = process.env.XLEAVE_ADMIN_TOKEN?.trim();
  if (!adminToken || adminToken.length < 32) return false;

  const session = parseCookies(request.get("cookie"))[SESSION_COOKIE];
  if (!session) return false;

  const [timestampValue, signature] = session.split(".");
  const timestamp = Number(timestampValue);
  if (
    !Number.isFinite(timestamp) ||
    Date.now() - timestamp > SESSION_TTL_SECONDS * 1000 ||
    timestamp > Date.now() + 60_000
  ) {
    return false;
  }

  return safeEqual(signature, signSession(timestampValue, adminToken));
}

function createSession(adminToken) {
  const timestamp = String(Date.now());
  return `${timestamp}.${signSession(timestamp, adminToken)}`;
}

function signSession(timestamp, adminToken) {
  return createHmac("sha256", adminToken).update(timestamp).digest("hex");
}

function formatCount(value) {
  const count = Number(value || 0);
  return Number.isFinite(count) ? count.toLocaleString("zh-CN") : "0";
}

function formatUsageDate(value) {
  if (!value) return "尚未使用";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function publicMessage(error) {
  return error instanceof Error ? error.message : "操作失败";
}
