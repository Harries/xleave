import { timingSafeEqual } from "node:crypto";

import { findUserByToken, isUserStoreConfigured } from "./user-store.js";

export async function requireUser(request, response, next) {
  if (!isUserStoreConfigured() && parseUsers(process.env.XLEAVE_USERS).length === 0) {
    return response.status(503).json({
      error: "后端尚未配置用户存储"
    });
  }

  const providedToken = extractBearerToken(request.get("authorization"));
  let user = null;
  try {
    user = providedToken ? await findUserByToken(providedToken) : null;
  } catch (error) {
    console.error("[X AI Reply] user store unavailable", error);
    return response.status(503).json({
      error: "用户存储暂时不可用"
    });
  }

  if (!user) {
    return response.status(401).json({
      error: "访问令牌无效"
    });
  }

  response.locals.user = {
    id: user.id,
    allowedIps: user.allowedIps
  };
  return next();
}

export function parseUsers(value) {
  if (typeof value !== "string" || !value.trim()) return [];

  try {
    const users = JSON.parse(value);
    if (!Array.isArray(users)) return [];

    const seenIds = new Set();
    const seenTokens = new Set();
    return users
      .map((user) => ({
        id: typeof user?.id === "string" ? user.id.trim() : "",
        token: typeof user?.token === "string" ? user.token.trim() : "",
        allowedIps: Array.isArray(user?.allowedIps)
          ? user.allowedIps.filter((ip) => typeof ip === "string")
          : []
      }))
      .filter((user) => {
        const valid =
          /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/.test(user.id) &&
          user.token.length >= 32 &&
          !seenIds.has(user.id) &&
          !seenTokens.has(user.token);
        if (valid) {
          seenIds.add(user.id);
          seenTokens.add(user.token);
        }
        return valid;
      });
  } catch {
    return [];
  }
}

export function extractBearerToken(authorizationHeader) {
  if (typeof authorizationHeader !== "string") return "";

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

export function safeTokenEqual(providedToken, configuredToken) {
  if (typeof providedToken !== "string" || typeof configuredToken !== "string") {
    return false;
  }

  const provided = Buffer.from(providedToken);
  const configured = Buffer.from(configuredToken);

  if (provided.length !== configured.length) return false;
  return timingSafeEqual(provided, configured);
}
