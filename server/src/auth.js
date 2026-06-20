import { timingSafeEqual } from "node:crypto";

export function requireApiToken(request, response, next) {
  const configuredToken = process.env.XLEAVE_API_TOKEN?.trim();

  if (!configuredToken) {
    return response.status(503).json({
      error: "后端尚未配置 XLEAVE_API_TOKEN"
    });
  }

  const providedToken = extractBearerToken(request.get("authorization"));
  if (!providedToken || !safeTokenEqual(providedToken, configuredToken)) {
    return response.status(401).json({
      error: "访问令牌无效"
    });
  }

  return next();
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

