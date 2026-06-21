import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM encryption for storing merchant API keys in the DB.
 * Set DRIFT_ENCRYPTION_KEY in .env — generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const hex = process.env.DRIFT_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "DRIFT_ENCRYPTION_KEY must be a 64-char hex string (32 bytes). " +
        "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  return Buffer.from(hex, "hex");
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Store as iv:tag:ciphertext (all hex)
  return [iv.toString("hex"), tag.toString("hex"), encrypted.toString("hex")].join(":");
}

export function decrypt(stored: string): string {
  const [ivHex, tagHex, encHex] = stored.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const encrypted = Buffer.from(encHex, "hex");
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final("utf8");
}

/** Validate that a string looks like an Anthropic key before storing it. */
export function isValidAnthropicKey(key: string): boolean {
  return /^sk-ant-[a-zA-Z0-9\-_]{20,}$/.test(key.trim());
}

/** Validate that a string looks like a Shopify custom-app Admin API token. */
export function isValidThemeToken(token: string): boolean {
  return /^shpat_[a-zA-Z0-9]{20,}$/.test(token.trim());
}
