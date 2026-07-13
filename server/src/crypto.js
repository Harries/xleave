import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual
} from "node:crypto";

const SCRYPT_KEYLEN = 32;
const SESSION_TTL_SECONDS = 12 * 60 * 60;

export function isSecretConfigured() {
  return Boolean(process.env.XLEAVE_SECRET_KEY?.trim());
}

// ---------------------------------------------------------------------------
// Password hashing (scrypt)
// ---------------------------------------------------------------------------

export function hashPassword(password) {
  const plain = normalizePassword(password);
  const salt = randomBytes(16);
  const derived = scryptSync(plain, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function verifyPassword(password, stored) {
  if (typeof stored !== "string") return false;
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;

  let salt;
  let expected;
  try {
    salt = Buffer.from(saltHex, "hex");
    expected = Buffer.from(hashHex, "hex");
  } catch {
    return false;
  }
  if (expected.length !== SCRYPT_KEYLEN) return false;

  const derived = scryptSync(normalizePassword(password), salt, SCRYPT_KEYLEN);
  return timingSafeEqual(derived, expected);
}

// ---------------------------------------------------------------------------
// AES-256-GCM secret encryption (for user-provided AI API keys)
// ---------------------------------------------------------------------------

export function encryptSecret(plaintext) {
  const key = getAesKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(String(plaintext), "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSecret(payload) {
  if (typeof payload !== "string") {
    throw new Error("AI 密钥密文无效");
  }
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error("AI 密钥密文无效");
  }

  const key = getAesKey();
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final()
  ]);
  return decrypted.toString("utf8");
}

// ---------------------------------------------------------------------------
// Signed user sessions (HMAC over id.timestamp)
// ---------------------------------------------------------------------------

export function signSession(userId) {
  const id = String(userId);
  const timestamp = String(Date.now());
  const signature = signSessionPayload(`${id}.${timestamp}`);
  return `${encodeSessionSegment(id)}.${timestamp}.${signature}`;
}

export function verifySession(cookieValue) {
  if (typeof cookieValue !== "string" || !cookieValue) return null;

  const parts = cookieValue.split(".");
  if (parts.length !== 3) return null;
  const [encodedId, timestampValue, signature] = parts;

  const timestamp = Number(timestampValue);
  if (
    !Number.isFinite(timestamp) ||
    Date.now() - timestamp > SESSION_TTL_SECONDS * 1000 ||
    timestamp > Date.now() + 60_000
  ) {
    return null;
  }

  let id;
  try {
    id = decodeSessionSegment(encodedId);
  } catch {
    return null;
  }

  const expected = signSessionPayload(`${id}.${timestampValue}`);
  if (!safeEqual(signature, expected)) return null;

  return { id, issuedAt: timestamp };
}

export const sessionTtlSeconds = SESSION_TTL_SECONDS;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getSecret() {
  const secret = process.env.XLEAVE_SECRET_KEY?.trim();
  if (!secret || secret.length < 16) {
    throw new Error("尚未配置 XLEAVE_SECRET_KEY");
  }
  return secret;
}

function getAesKey() {
  return createHash("sha256").update(`${getSecret()}:aes`).digest();
}

function signSessionPayload(payload) {
  return createHmac("sha256", `${getSecret()}:session`)
    .update(payload)
    .digest("hex");
}

function normalizePassword(password) {
  const value = typeof password === "string" ? password : "";
  return value;
}

function encodeSessionSegment(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeSessionSegment(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function safeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}
