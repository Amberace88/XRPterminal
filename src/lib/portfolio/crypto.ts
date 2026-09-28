import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * AES-256-GCM encryption for exchange API credentials at rest (spec §41).
 * SERVER ONLY — uses node:crypto and CREDENTIALS_ENCRYPTION_KEY; never import from client code.
 *
 * Payload format: "v1.<iv base64>.<auth tag base64>.<ciphertext base64>" (12-byte IV, 16-byte tag).
 * Optional AAD binds the ciphertext to a context (e.g. user id + exchange) so it cannot be swapped.
 */

const VERSION = "v1";

export class CredentialKeyError extends Error {}

/** Accepts a 32-byte key as 64 hex chars or base64 (44 chars). */
export function parseEncryptionKey(raw: string | undefined | null): Buffer {
  const s = (raw ?? "").trim();
  if (/^[0-9a-fA-F]{64}$/.test(s)) return Buffer.from(s, "hex");
  if (s) {
    try {
      const b = Buffer.from(s, "base64");
      if (b.length === 32) return b;
    } catch {
      /* fallthrough */
    }
  }
  throw new CredentialKeyError("CREDENTIALS_ENCRYPTION_KEY must be 32 bytes (64 hex chars or base64)");
}

export function encryptSecret(plaintext: string, rawKey: string, aad?: string): string {
  const key = parseEncryptionKey(rawKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  if (aad) cipher.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(".");
}

/** Throws if the key, AAD or payload do not match (GCM authentication failure). */
export function decryptSecret(payload: string, rawKey: string, aad?: string): string {
  const key = parseEncryptionKey(rawKey);
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error("Unsupported credential payload");
  const [, ivB, tagB, ctB] = parts;
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB, "base64"));
  if (aad) decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB, "base64")), decipher.final()]).toString("utf8");
}

/** Non-reversible fingerprint for display & duplicate detection: sha256 prefix + last 4 chars. */
export function keyFingerprint(apiKey: string): string {
  const h = createHash("sha256").update(apiKey, "utf8").digest("hex").slice(0, 12);
  return `${h}…${apiKey.slice(-4)}`;
}
