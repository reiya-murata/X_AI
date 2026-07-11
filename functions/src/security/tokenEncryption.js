const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const KEY_VERSION = 1;

function encryptText(plainText) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    algorithm: ALGORITHM,
    keyVersion: KEY_VERSION,
  };
}

function decryptText(encryptedValue) {
  if (!encryptedValue || encryptedValue.algorithm !== ALGORITHM) {
    throw new Error("INVALID_ENCRYPTED_VALUE");
  }

  const key = getKey();
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(encryptedValue.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(encryptedValue.authTag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function hashValue(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function randomUrlSafe(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function createCodeChallenge(codeVerifier) {
  return crypto.createHash("sha256").update(codeVerifier).digest("base64url");
}

function getKey() {
  const raw = process.env.X_TOKEN_ENCRYPTION_KEY || "dev-only-32-byte-key-for-local!!";
  if (/^[A-Za-z0-9+/=]{44}$/.test(raw)) {
    return Buffer.from(raw, "base64");
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  const key = Buffer.from(raw, "utf8");
  if (key.length !== 32) {
    throw new Error("X_TOKEN_ENCRYPTION_KEY must be 32 bytes, base64, or hex encoded.");
  }
  return key;
}

module.exports = {
  encryptText,
  decryptText,
  hashValue,
  randomUrlSafe,
  createCodeChallenge,
};
