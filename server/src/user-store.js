import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

import { neon } from "@neondatabase/serverless";

import { encryptSecret, hashPassword, verifyPassword } from "./crypto.js";

const AI_PROVIDERS = new Set(["openai", "deepseek"]);

let sqlClient;
let schemaPromise;

export function isUserStoreConfigured() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export async function findUserByToken(token) {
  const tokenHash = hashToken(token);

  if (isUserStoreConfigured()) {
    const sql = getSql();
    await ensureSchema();
    const rows = await sql`
      SELECT id, allowed_ips, enabled, ai_provider, ai_key_cipher, ai_model, persona,
        pref_language, pref_max_characters, pref_include_context
      FROM xleave_users
      WHERE token_hash = ${tokenHash}
      LIMIT 1
    `;
    const user = rows[0];
    if (user?.enabled) {
      return {
        id: user.id,
        allowedIps: user.allowed_ips,
        enabled: true,
        source: "neon",
        aiProvider: user.ai_provider || "openai",
        aiKeyCipher: user.ai_key_cipher || null,
        aiModel: user.ai_model || null,
        persona: user.persona || "",
        prefLanguage: user.pref_language || "auto",
        prefMaxCharacters: Number(user.pref_max_characters ?? 180),
        prefIncludeContext: user.pref_include_context !== false
      };
    }
  }

  return findEnvironmentUser(tokenHash);
}

export async function listUsers() {
  const sql = requireSql();
  await ensureSchema();
  const rows = await sql`
    SELECT
      id,
      token_hint,
      allowed_ips,
      enabled,
      usage_count,
      last_used_at,
      created_at,
      updated_at
    FROM xleave_users
    ORDER BY id ASC
  `;
  return rows.map(mapStoredUser);
}

export async function createUser({ id, allowedIps, token }) {
  const sql = requireSql();
  await ensureSchema();
  const normalizedId = validateUserId(id);
  const normalizedIps = validateAllowedIps(allowedIps);
  const plainToken = normalizeOrGenerateToken(token);
  const tokenHash = hashToken(plainToken);

  try {
    const rows = await sql`
      INSERT INTO xleave_users (
        id,
        token_hash,
        token_hint,
        allowed_ips,
        enabled
      )
      VALUES (
        ${normalizedId},
        ${tokenHash},
        ${plainToken.slice(-6)},
        ${JSON.stringify(normalizedIps)}::jsonb,
        TRUE
      )
      RETURNING
        id, token_hint, allowed_ips, enabled, usage_count, last_used_at,
        created_at, updated_at
    `;
    return { user: mapStoredUser(rows[0]), token: plainToken };
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export async function updateUserIps(id, allowedIps) {
  const sql = requireSql();
  await ensureSchema();
  const normalizedId = validateUserId(id);
  const normalizedIps = validateAllowedIps(allowedIps);
  const rows = await sql`
    UPDATE xleave_users
    SET allowed_ips = ${JSON.stringify(normalizedIps)}::jsonb, updated_at = NOW()
    WHERE id = ${normalizedId}
    RETURNING
      id, token_hint, allowed_ips, enabled, usage_count, last_used_at,
      created_at, updated_at
  `;
  if (!rows[0]) throw new Error("用户不存在");
  return mapStoredUser(rows[0]);
}

export async function setUserEnabled(id, enabled) {
  const sql = requireSql();
  await ensureSchema();
  const normalizedId = validateUserId(id);
  const rows = await sql`
    UPDATE xleave_users
    SET enabled = ${Boolean(enabled)}, updated_at = NOW()
    WHERE id = ${normalizedId}
    RETURNING
      id, token_hint, allowed_ips, enabled, usage_count, last_used_at,
      created_at, updated_at
  `;
  if (!rows[0]) throw new Error("用户不存在");
  return mapStoredUser(rows[0]);
}

export async function rotateUserToken(id, token) {
  const sql = requireSql();
  await ensureSchema();
  const normalizedId = validateUserId(id);
  const plainToken = normalizeOrGenerateToken(token);
  const tokenHash = hashToken(plainToken);

  try {
    const rows = await sql`
      UPDATE xleave_users
      SET
        token_hash = ${tokenHash},
        token_hint = ${plainToken.slice(-6)},
        updated_at = NOW()
      WHERE id = ${normalizedId}
      RETURNING
        id, token_hint, allowed_ips, enabled, usage_count, last_used_at,
        created_at, updated_at
    `;
    if (!rows[0]) throw new Error("用户不存在");
    return { user: mapStoredUser(rows[0]), token: plainToken };
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export async function deleteUser(id) {
  const sql = requireSql();
  await ensureSchema();
  const normalizedId = validateUserId(id);
  const rows = await sql`
    DELETE FROM xleave_users
    WHERE id = ${normalizedId}
    RETURNING id
  `;
  if (!rows[0]) throw new Error("用户不存在");
}

export async function recordUserUsage(user) {
  if (user?.source !== "neon" || !isUserStoreConfigured()) return;

  const sql = getSql();
  await ensureSchema();
  await sql`
    UPDATE xleave_users
    SET
      usage_count = usage_count + 1,
      last_used_at = NOW()
    WHERE id = ${user.id}
  `;
}

// ---------------------------------------------------------------------------
// Self-service account management (registration, login, personal center)
// ---------------------------------------------------------------------------

export async function registerUser({ username, password }) {
  const sql = requireSql();
  await ensureSchema();
  const normalizedId = validateUserId(username);
  const passwordHash = hashPassword(validatePassword(password));
  const plainToken = generateToken();
  const tokenHash = hashToken(plainToken);

  try {
    const rows = await sql`
      INSERT INTO xleave_users (
        id,
        token_hash,
        token_hint,
        password_hash,
        allowed_ips,
        enabled
      )
      VALUES (
        ${normalizedId},
        ${tokenHash},
        ${plainToken.slice(-6)},
        ${passwordHash},
        '[]'::jsonb,
        TRUE
      )
      RETURNING id, token_hint, allowed_ips, enabled, usage_count, last_used_at,
        created_at, updated_at
    `;
    return { user: mapStoredUser(rows[0]), token: plainToken };
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export async function authenticateUser(username, password) {
  const sql = requireSql();
  await ensureSchema();
  const normalizedId = String(username || "").trim();
  if (!normalizedId) return null;

  const rows = await sql`
    SELECT id, password_hash, enabled
    FROM xleave_users
    WHERE id = ${normalizedId}
    LIMIT 1
  `;
  const user = rows[0];
  if (!user || !user.password_hash) return null;
  if (!verifyPassword(String(password || ""), user.password_hash)) return null;
  if (user.enabled === false) throw new Error("账号已被停用，请联系管理员");
  return { id: user.id };
}

export async function getAccountProfile(id) {
  const sql = requireSql();
  await ensureSchema();
  const normalizedId = validateUserId(id);
  const rows = await sql`
    SELECT id, token_hint, allowed_ips, enabled, usage_count, last_used_at,
      ai_provider, ai_key_cipher, ai_model, persona,
      pref_language, pref_max_characters, pref_include_context,
      created_at, updated_at
    FROM xleave_users
    WHERE id = ${normalizedId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) throw new Error("账号不存在");
  return {
    ...mapStoredUser(row),
    aiProvider: row.ai_provider || "openai",
    aiModel: row.ai_model || "",
    persona: row.persona || "",
    hasAiKey: Boolean(row.ai_key_cipher),
    prefLanguage: row.pref_language || "auto",
    prefMaxCharacters: Number(row.pref_max_characters ?? 180),
    prefIncludeContext: row.pref_include_context !== false
  };
}

export async function updateAiSettings(id, { provider, apiKey, model }) {
  const sql = requireSql();
  await ensureSchema();
  const normalizedId = validateUserId(id);
  const normalizedProvider = validateAiProvider(provider);
  const normalizedModel = validateAiModel(model);
  const trimmedKey = String(apiKey || "").trim();
  const cipher = trimmedKey ? encryptSecret(trimmedKey) : null;

  // Keep the existing key when the form leaves the field blank.
  const rows = trimmedKey
    ? await sql`
        UPDATE xleave_users
        SET ai_provider = ${normalizedProvider},
            ai_model = ${normalizedModel},
            ai_key_cipher = ${cipher},
            updated_at = NOW()
        WHERE id = ${normalizedId}
        RETURNING id
      `
    : await sql`
        UPDATE xleave_users
        SET ai_provider = ${normalizedProvider},
            ai_model = ${normalizedModel},
            updated_at = NOW()
        WHERE id = ${normalizedId}
        RETURNING id
      `;
  if (!rows[0]) throw new Error("账号不存在");
}

export async function clearAiKey(id) {
  const sql = requireSql();
  await ensureSchema();
  const normalizedId = validateUserId(id);
  const rows = await sql`
    UPDATE xleave_users
    SET ai_key_cipher = NULL, updated_at = NOW()
    WHERE id = ${normalizedId}
    RETURNING id
  `;
  if (!rows[0]) throw new Error("账号不存在");
}

export async function updatePreferences(
  id,
  { persona, language, maxCharacters, includeContext }
) {
  const sql = requireSql();
  await ensureSchema();
  const normalizedId = validateUserId(id);
  const value = String(persona || "").slice(0, 1000);
  const normalizedLanguage = validateLanguage(language);
  const normalizedMax = validateMaxCharacters(maxCharacters);
  const normalizedContext = Boolean(includeContext);
  const rows = await sql`
    UPDATE xleave_users
    SET persona = ${value},
        pref_language = ${normalizedLanguage},
        pref_max_characters = ${normalizedMax},
        pref_include_context = ${normalizedContext},
        updated_at = NOW()
    WHERE id = ${normalizedId}
    RETURNING id
  `;
  if (!rows[0]) throw new Error("账号不存在");
}

export async function setUserIps(id, allowedIps) {
  const sql = requireSql();
  await ensureSchema();
  const normalizedId = validateUserId(id);
  const normalizedIps = validateOptionalAllowedIps(allowedIps);
  const rows = await sql`
    UPDATE xleave_users
    SET allowed_ips = ${JSON.stringify(normalizedIps)}::jsonb, updated_at = NOW()
    WHERE id = ${normalizedId}
    RETURNING id
  `;
  if (!rows[0]) throw new Error("账号不存在");
}

export async function changePassword(id, currentPassword, newPassword) {
  const sql = requireSql();
  await ensureSchema();
  const normalizedId = validateUserId(id);
  const rows = await sql`
    SELECT password_hash FROM xleave_users WHERE id = ${normalizedId} LIMIT 1
  `;
  const row = rows[0];
  if (!row) throw new Error("账号不存在");
  if (!row.password_hash || !verifyPassword(String(currentPassword || ""), row.password_hash)) {
    throw new Error("当前密码不正确");
  }
  const passwordHash = hashPassword(validatePassword(newPassword));
  await sql`
    UPDATE xleave_users
    SET password_hash = ${passwordHash}, updated_at = NOW()
    WHERE id = ${normalizedId}
  `;
}

export function generateToken() {
  return randomBytes(32).toString("hex");
}

export function hashToken(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

async function ensureSchema() {
  if (!isUserStoreConfigured()) return;
  schemaPromise ||= (async () => {
    const sql = getSql();
    await sql`
      CREATE TABLE IF NOT EXISTS xleave_users (
        id VARCHAR(64) PRIMARY KEY,
        token_hash CHAR(64) UNIQUE NOT NULL,
        token_hint VARCHAR(6) NOT NULL,
        allowed_ips JSONB NOT NULL DEFAULT '[]'::jsonb,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        usage_count BIGINT NOT NULL DEFAULT 0,
        last_used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      ALTER TABLE xleave_users
      ADD COLUMN IF NOT EXISTS usage_count BIGINT NOT NULL DEFAULT 0
    `;
    await sql`
      ALTER TABLE xleave_users
      ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ
    `;
    await sql`
      ALTER TABLE xleave_users
      ADD COLUMN IF NOT EXISTS password_hash TEXT
    `;
    await sql`
      ALTER TABLE xleave_users
      ADD COLUMN IF NOT EXISTS ai_provider VARCHAR(20) NOT NULL DEFAULT 'openai'
    `;
    await sql`
      ALTER TABLE xleave_users
      ADD COLUMN IF NOT EXISTS ai_key_cipher TEXT
    `;
    await sql`
      ALTER TABLE xleave_users
      ADD COLUMN IF NOT EXISTS ai_model VARCHAR(80)
    `;
    await sql`
      ALTER TABLE xleave_users
      ADD COLUMN IF NOT EXISTS persona TEXT NOT NULL DEFAULT ''
    `;
    await sql`
      ALTER TABLE xleave_users
      ADD COLUMN IF NOT EXISTS pref_language VARCHAR(10) NOT NULL DEFAULT 'auto'
    `;
    await sql`
      ALTER TABLE xleave_users
      ADD COLUMN IF NOT EXISTS pref_max_characters INT NOT NULL DEFAULT 180
    `;
    await sql`
      ALTER TABLE xleave_users
      ADD COLUMN IF NOT EXISTS pref_include_context BOOLEAN NOT NULL DEFAULT TRUE
    `;
  })();
  try {
    await schemaPromise;
  } catch (error) {
    schemaPromise = null;
    throw error;
  }
}

function getSql() {
  sqlClient ||= neon(process.env.DATABASE_URL);
  return sqlClient;
}

function requireSql() {
  if (!isUserStoreConfigured()) {
    throw new Error("尚未配置 Neon，请设置 DATABASE_URL");
  }
  return getSql();
}

function findEnvironmentUser(tokenHash) {
  const value = process.env.XLEAVE_USERS;
  if (!value) return null;

  try {
    const users = JSON.parse(value);
    if (!Array.isArray(users)) return null;

    for (const candidate of users) {
      if (
        typeof candidate?.id === "string" &&
        typeof candidate?.token === "string" &&
        safeHashEqual(hashToken(candidate.token.trim()), tokenHash)
      ) {
        return {
          id: candidate.id.trim(),
          allowedIps: Array.isArray(candidate.allowedIps)
            ? candidate.allowedIps
            : [],
          enabled: true,
          source: "environment"
        };
      }
    }
  } catch {
    return null;
  }

  return null;
}

function validateUserId(value) {
  const id = String(value || "").trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/.test(id)) {
    throw new Error("用户 ID 需为 3–64 位字母、数字、下划线或连字符");
  }
  return id;
}

function validateAllowedIps(value) {
  const values = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/[\s,]+/)
        .filter(Boolean);
  const ips = [...new Set(values.map((ip) => String(ip).trim().toLowerCase()))];
  const invalid = ips.find((ip) => isIP(ip) === 0);
  if (invalid) throw new Error(`无效 IP：${invalid}`);
  if (ips.length === 0) throw new Error("至少配置一个公网 IP");
  return ips;
}

function validateOptionalAllowedIps(value) {
  const values = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/[\s,]+/)
        .filter(Boolean);
  const ips = [...new Set(values.map((ip) => String(ip).trim().toLowerCase()))];
  const invalid = ips.find((ip) => isIP(ip) === 0);
  if (invalid) throw new Error(`无效 IP：${invalid}`);
  return ips;
}

function validatePassword(value) {
  const password = String(value || "");
  if (password.length < 8 || password.length > 200) {
    throw new Error("密码需为 8–200 个字符");
  }
  return password;
}

function validateAiProvider(value) {
  const provider = String(value || "").trim().toLowerCase();
  if (!AI_PROVIDERS.has(provider)) {
    throw new Error("暂不支持的 AI 服务商");
  }
  return provider;
}

function validateLanguage(value) {
  const language = String(value || "auto").trim();
  const allowed = new Set(["auto", "zh-CN", "zh-TW", "en", "ja"]);
  if (!allowed.has(language)) throw new Error("不支持的生成语言");
  return language;
}

function validateMaxCharacters(value) {
  const max = Math.trunc(Number(value));
  if (!Number.isFinite(max) || max < 30 || max > 500) {
    throw new Error("最大字符数需在 30–500 之间");
  }
  return max;
}

function validateAiModel(value) {
  const model = String(value || "").trim();
  if (!model) return null;
  if (model.length > 80 || !/^[a-zA-Z0-9._:-]+$/.test(model)) {
    throw new Error("模型名称无效");
  }
  return model;
}

function normalizeOrGenerateToken(value) {
  const token = String(value || "").trim() || generateToken();
  if (token.length < 32) throw new Error("Token 至少需要 32 个字符");
  return token;
}

function mapStoredUser(row) {
  return {
    id: row.id,
    tokenHint: row.token_hint,
    allowedIps: row.allowed_ips,
    enabled: row.enabled,
    usageCount: Number(row.usage_count || 0),
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapDatabaseError(error) {
  if (error?.code === "23505") {
    const detail = String(error.detail || "");
    if (detail.includes("token_hash")) return new Error("该 Token 已被其他用户使用");
    return new Error("用户 ID 已存在");
  }
  return error instanceof Error ? error : new Error("数据库操作失败");
}

function safeHashEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}
