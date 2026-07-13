import { timingSafeEqual } from "node:crypto";

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function parseCookies(value = "") {
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

export function serializeCookie(name, value, { maxAge, path = "/" } = {}) {
  const secure = process.env.NODE_ENV === "production" || process.env.VERCEL;
  return [
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
    `Path=${path}`,
    "HttpOnly",
    "SameSite=Strict",
    secure ? "Secure" : "",
    `Max-Age=${maxAge}`
  ]
    .filter(Boolean)
    .join("; ");
}

export function safeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function page(title, content) {
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
        label{display:grid;gap:6px;font-weight:650}input,textarea,select,button{font:inherit;border-radius:10px}input,textarea,select{width:100%;padding:10px 12px;border:1px solid #c7d1d8;background:#fff}textarea{resize:vertical}
        label.checkbox-row{display:flex;align-items:center;gap:8px}label.checkbox-row input{width:auto;padding:0}
        .token-copy{display:flex;gap:8px}.token-copy input{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.token-copy button{white-space:nowrap;width:auto}
        button{padding:9px 14px;border:0;background:#1d9bf0;color:#fff;font-weight:700;cursor:pointer}button:disabled{opacity:.5;cursor:not-allowed}.secondary{background:#536471}.danger{background:#f4212e}
        .actions{margin-top:14px;flex-wrap:wrap}.actions form:first-child{display:flex;flex:1;gap:8px;min-width:260px}.alert,.secret{margin-top:14px;padding:14px 16px;border-radius:12px}.success{background:#e8f8f1;color:#087a50}.error{background:#fff0f1;color:#b31321}.secret{background:#fff8db;display:flex;align-items:center;gap:10px;flex-wrap:wrap}.secret code{overflow-wrap:anywhere}
        .badge{padding:3px 8px;border-radius:999px;background:#e8f8f1;color:#087a50;font-size:12px}.badge.off{background:#eef1f3;color:#536471}.count{font-size:14px;color:#536471}.empty{margin:0}
        .usage-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:14px 0}.usage-stats>div{display:grid;gap:3px;padding:12px;border-radius:10px;background:#f5f7f9}.usage-stats strong{font-size:18px}.usage-stats span{color:#536471;font-size:12px}
        small{color:#536471;font-weight:400}.muted-link{color:#536471}.field-hint{font-weight:400;color:#536471;font-size:13px}nav.subnav{display:flex;gap:14px;padding:12px 0}nav.subnav a{color:#1d9bf0;font-weight:650}
        .app{display:flex;min-height:100vh;background:#f5f7f9}
        .app-sidebar{display:flex;flex-direction:column;width:246px;flex-shrink:0;padding:18px 14px;gap:6px;background:#0f1420;color:#c3cbda;position:sticky;top:0;height:100vh;transition:width .18s ease}
        .app.collapsed .app-sidebar{width:66px}
        .app-brand{display:flex;align-items:center;gap:11px;padding:6px 8px 16px}
        .app-brand-mark{display:grid;place-items:center;width:34px;height:34px;flex-shrink:0;border-radius:10px;background:linear-gradient(145deg,#26d8ff,#5267ff 60%,#9d4dff);color:#08121f;font-weight:800}
        .app-brand-text{display:flex;flex-direction:column;line-height:1.25;overflow:hidden;white-space:nowrap}
        .app-brand-text strong{color:#fff;font-size:16px}.app-brand-text small{color:#8a93a6;font-size:12px}
        .app-nav{display:flex;flex-direction:column;gap:4px;flex:1;min-height:0}
        .app-nav-item{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:10px;color:#aeb7c7;font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;background:transparent;border:0;cursor:pointer;text-align:left}
        .app-nav-item:hover{background:rgba(255,255,255,.06);color:#fff}
        .app-nav-item.active{background:rgba(82,103,255,.24);color:#fff}
        .app-nav-icon{flex-shrink:0;width:22px;text-align:center;font-size:16px}
        .app-foot{margin-top:auto;display:flex;flex-direction:column;gap:6px;padding-top:12px;border-top:1px solid rgba(255,255,255,.08)}
        .app-foot form{margin:0}.app-foot .app-nav-item{width:100%}
        .app-collapse{display:flex;align-items:center;justify-content:center;width:100%;padding:9px;border-radius:10px;background:rgba(255,255,255,.06);color:#aeb7c7;border:0;cursor:pointer;font-size:15px;font-weight:700}
        .app-collapse:hover{background:rgba(255,255,255,.12);color:#fff}.app.collapsed .app-collapse{transform:scaleX(-1)}
        .app.collapsed .label,.app.collapsed .app-brand-text{display:none}
        .app.collapsed .app-nav-item,.app.collapsed .app-brand{justify-content:center;gap:0;padding-left:0;padding-right:0}
        .app-main{flex:1;min-width:0}.app-main-inner{width:min(960px,calc(100% - 48px));margin:0 auto;padding:10px 0 52px}
        .app-main-inner>header{padding:28px 0 8px}
        code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}@media(max-width:600px){header,.user-head{align-items:flex-start}.actions{align-items:stretch}.actions form{width:100%}}
        @media(max-width:640px){.app-sidebar{width:66px}.app-sidebar .label,.app-sidebar .app-brand-text{display:none}.app-sidebar .app-nav-item,.app-sidebar .app-brand{justify-content:center;gap:0}.app-main-inner{width:calc(100% - 28px)}}
      </style>
    </head>
    <body>${content}</body>
  </html>`;
}

/**
 * Dashboard layout: a collapsible left sidebar + right content area.
 * nav items: { href, icon, label, active, external }
 * footer: raw HTML rendered at the bottom of the sidebar (e.g. logout form).
 */
export function renderAppShell({ subtitle = "", nav = [], footer = "", main }) {
  const navHtml = nav
    .map(
      (item) => `
        <a href="${escapeHtml(item.href)}" class="app-nav-item${item.active ? " active" : ""}"${
          item.external ? ' target="_blank" rel="noreferrer"' : ""
        }>
          <span class="app-nav-icon">${item.icon || "•"}</span>
          <span class="label">${escapeHtml(item.label)}</span>
        </a>`
    )
    .join("");

  return `
    <div class="app" id="app">
      <aside class="app-sidebar">
        <div class="app-brand">
          <span class="app-brand-mark">✦</span>
          <span class="app-brand-text"><strong>XLeave</strong><small>${escapeHtml(subtitle)}</small></span>
        </div>
        <nav class="app-nav">${navHtml}</nav>
        <div class="app-foot">
          ${footer}
          <button type="button" class="app-collapse" id="app-collapse" aria-label="折叠侧栏" title="折叠侧栏">‹</button>
        </div>
      </aside>
      <main class="app-main">
        <div class="app-main-inner">${main}</div>
      </main>
    </div>
    <script>
      (function () {
        var app = document.getElementById("app");
        var btn = document.getElementById("app-collapse");
        try {
          if (localStorage.getItem("xleave_sidebar") === "collapsed") {
            app.classList.add("collapsed");
          }
        } catch (e) {}
        if (btn) {
          btn.addEventListener("click", function () {
            app.classList.toggle("collapsed");
            try {
              localStorage.setItem(
                "xleave_sidebar",
                app.classList.contains("collapsed") ? "collapsed" : "open"
              );
            } catch (e) {}
          });
        }
      })();
    </script>`;
}
