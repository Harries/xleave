import { isIP } from "node:net";

export function requireAllowedIp(request, response, next) {
  const allowedIps = parseAllowedIps(process.env.XLEAVE_ALLOWED_IPS);
  const clientIp = getClientIp(request);
  console.info(`[X AI Reply] request public IP: ${clientIp || "unknown"}`);

  if (allowedIps.size === 0) {
    return response.status(503).json({
      error: `后端尚未配置 XLEAVE_ALLOWED_IPS；当前公网 IP：${clientIp || "未识别"}`,
      clientIp: clientIp || null
    });
  }

  if (!clientIp || !allowedIps.has(clientIp)) {
    return response.status(403).json({
      error: `当前公网 IP 不允许访问：${clientIp || "未识别"}`,
      clientIp: clientIp || null
    });
  }

  response.locals.clientIp = clientIp;
  return next();
}

export function parseAllowedIps(value) {
  if (typeof value !== "string") return new Set();

  return new Set(
    value
      .split(",")
      .map(normalizeIp)
      .filter((ip) => isIP(ip) !== 0)
  );
}

export function getClientIp(request) {
  if (process.env.VERCEL === "1") {
    return normalizeIp(request.get?.("x-real-ip"));
  }

  return normalizeIp(
    request.socket?.remoteAddress ||
      request.connection?.remoteAddress ||
      request.ip ||
      ""
  );
}

export function normalizeIp(value) {
  if (typeof value !== "string") return "";

  let ip = value.trim();
  if (!ip) return "";

  if (ip.startsWith("[")) {
    const closingBracket = ip.indexOf("]");
    if (closingBracket > 0) {
      ip = ip.slice(1, closingBracket);
    }
  } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(ip)) {
    ip = ip.slice(0, ip.lastIndexOf(":"));
  }

  if (ip.toLowerCase().startsWith("::ffff:")) {
    ip = ip.slice(7);
  }

  return ip.toLowerCase();
}
