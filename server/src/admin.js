import { createHmac, timingSafeEqual } from "node:crypto";

import {
  createUser,
  deleteUser,
  isUserStoreConfigured,
  listUsers,
  rotateUserToken,
  setUserEnabled,
  updateUserIps
} from "./user-store.js";

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
        maxAge: SESSION_TTL_SECONDS
      })
    );
    return response.redirect(303, "/admin");
  });

  app.post("/admin/logout", requireAdmin, requireSameOrigin, (_request, response) => {
    response.setHeader(
      "Set-Cookie",
      serializeCookie(SESSION_COOKIE, "", { maxAge: 0 })
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
  if (request.get("sec-fetch-site") === "cross-site") return false;

  const source = request.get("origin") || request.get("referer");
  if (!source) return false;

  try {
    const sourceHost = new URL(source).host.toLowerCase();
    return getExpectedAdminHosts(request).has(sourceHost);
  } catch {
    return false;
  }
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
        <div><h3>${escapeHtml(user.id)}</h3><span class="badge ${user.enabled === false ? "off" : ""}">${user.enabled === false ? "已停用" : "启用中"}</span></div>
        <small>Token 尾号 ···${escapeHtml(user.tokenHint || "未知")}</small>
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

function page(title, content) {
  return `<!doctype html>
  <html lang="zh-CN">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${escapeHtml(title)} · XLeave</title>
      <style>
        :root{color:#0f1419;background:#f5f7f9;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        *{box-sizing:border-box}body{margin:0}body>main,body>header,body>section,body>.alert,body>.secret{width:min(920px,calc(100% - 32px));margin-left:auto;margin-right:auto}
        header{display:flex;justify-content:space-between;align-items:center;padding:36px 0 18px}h1,h2,h3{margin:0 0 8px}p{color:#536471}section,.login-card{margin-top:18px;padding:22px;border:1px solid #d8e0e5;border-radius:18px;background:#fff}
        .login-card{max-width:480px;margin-top:10vh}.grid-form{display:grid;gap:14px}.users{display:grid;gap:14px}.user-card{padding:18px;border:1px solid #e3e8eb;border-radius:14px}.user-head,.actions{display:flex;justify-content:space-between;gap:12px;align-items:center}.user-head>div{display:flex;gap:10px;align-items:center}
        label{display:grid;gap:6px;font-weight:650}input,textarea,button{font:inherit;border-radius:10px}input,textarea{width:100%;padding:10px 12px;border:1px solid #c7d1d8;background:#fff}textarea{resize:vertical}
        button{padding:9px 14px;border:0;background:#1d9bf0;color:#fff;font-weight:700;cursor:pointer}button:disabled{opacity:.5;cursor:not-allowed}.secondary{background:#536471}.danger{background:#f4212e}
        .actions{margin-top:14px;flex-wrap:wrap}.actions form:first-child{display:flex;flex:1;gap:8px;min-width:260px}.alert,.secret{margin-top:14px;padding:14px 16px;border-radius:12px}.success{background:#e8f8f1;color:#087a50}.error{background:#fff0f1;color:#b31321}.secret{background:#fff8db;display:flex;align-items:center;gap:10px;flex-wrap:wrap}.secret code{overflow-wrap:anywhere}
        .badge{padding:3px 8px;border-radius:999px;background:#e8f8f1;color:#087a50;font-size:12px}.badge.off{background:#eef1f3;color:#536471}.count{font-size:14px;color:#536471}.empty{margin:0}
        code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}@media(max-width:600px){header,.user-head{align-items:flex-start}.actions{align-items:stretch}.actions form{width:100%}}
      </style>
    </head>
    <body>${content}</body>
  </html>`;
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

function safeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function parseCookies(value = "") {
  return Object.fromEntries(
    value
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key]) => key)
      .map(([key, ...rest]) => [
        decodeURIComponent(key),
        decodeURIComponent(rest.join("="))
      ])
  );
}

function serializeCookie(name, value, { maxAge }) {
  const secure = process.env.NODE_ENV === "production" || process.env.VERCEL;
  return [
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
    "Path=/admin",
    "HttpOnly",
    "SameSite=Strict",
    secure ? "Secure" : "",
    `Max-Age=${maxAge}`
  ]
    .filter(Boolean)
    .join("; ");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function publicMessage(error) {
  return error instanceof Error ? error.message : "操作失败";
}
