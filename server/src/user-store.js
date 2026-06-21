import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

import { neon } from "@neondatabase/serverless";

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
      SELECT id, allowed_ips, enabled
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
        source: "neon"
      };
    }
  }

  return findEnvironmentUser(tokenHash);
}

export async function listUsers() {
  const sql = requireSql();
  await ensureSchema();
  const rows = await sql`
    SELECT id, token_hint, allowed_ips, enabled, created_at, updated_at
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
      RETURNING id, token_hint, allowed_ips, enabled, created_at, updated_at
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
    RETURNING id, token_hint, allowed_ips, enabled, created_at, updated_at
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
    RETURNING id, token_hint, allowed_ips, enabled, created_at, updated_at
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
      RETURNING id, token_hint, allowed_ips, enabled, created_at, updated_at
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

export function generateToken() {
  return randomBytes(32).toString("hex");
}

export function hashToken(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

async function ensureSchema() {
  if (!isUserStoreConfigured()) return;
  schemaPromise ||= getSql()`
    CREATE TABLE IF NOT EXISTS xleave_users (
      id VARCHAR(64) PRIMARY KEY,
      token_hash CHAR(64) UNIQUE NOT NULL,
      token_hint VARCHAR(6) NOT NULL,
      allowed_ips JSONB NOT NULL DEFAULT '[]'::jsonb,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
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
