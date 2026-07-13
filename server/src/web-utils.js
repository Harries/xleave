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
        button{padding:9px 14px;border:0;background:#1d9bf0;color:#fff;font-weight:700;cursor:pointer}button:disabled{opacity:.5;cursor:not-allowed}.secondary{background:#536471}.danger{background:#f4212e}
        .actions{margin-top:14px;flex-wrap:wrap}.actions form:first-child{display:flex;flex:1;gap:8px;min-width:260px}.alert,.secret{margin-top:14px;padding:14px 16px;border-radius:12px}.success{background:#e8f8f1;color:#087a50}.error{background:#fff0f1;color:#b31321}.secret{background:#fff8db;display:flex;align-items:center;gap:10px;flex-wrap:wrap}.secret code{overflow-wrap:anywhere}
        .badge{padding:3px 8px;border-radius:999px;background:#e8f8f1;color:#087a50;font-size:12px}.badge.off{background:#eef1f3;color:#536471}.count{font-size:14px;color:#536471}.empty{margin:0}
        .usage-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:14px 0}.usage-stats>div{display:grid;gap:3px;padding:12px;border-radius:10px;background:#f5f7f9}.usage-stats strong{font-size:18px}.usage-stats span{color:#536471;font-size:12px}
        small{color:#536471;font-weight:400}.muted-link{color:#536471}.field-hint{font-weight:400;color:#536471;font-size:13px}nav.subnav{display:flex;gap:14px;padding:12px 0}nav.subnav a{color:#1d9bf0;font-weight:650}
        code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}@media(max-width:600px){header,.user-head{align-items:flex-start}.actions{align-items:stretch}.actions form{width:100%}}
      </style>
    </head>
    <body>${content}</body>
  </html>`;
}
