import "server-only";
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

// Iqama (residency ID) at-rest protection: AES-256-GCM for national_id_enc
// (reversible, needed when an admin views the number), HMAC-SHA256 for
// national_id_hash (one-way, indexed, used for the global uniqueness
// constraint and duplicate lookups without ever decrypting). Both keys are
// derived from the single NATIONAL_ID_HASH_KEY env var via purpose-scoped
// HMAC, so encryption and hashing never share raw key material.
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function requireSecret(): string {
  const secret = process.env.NATIONAL_ID_HASH_KEY;
  if (!secret) throw new Error("NATIONAL_ID_HASH_KEY is not set");
  return secret;
}

function deriveKey(purpose: "encrypt" | "hash"): Buffer {
  return createHmac("sha256", requireSecret()).update(purpose).digest();
}

export function hashNationalId(plainIqama: string): string {
  return createHmac("sha256", deriveKey("hash")).update(plainIqama).digest("hex");
}

export function encryptNationalId(plainIqama: string): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", deriveKey("encrypt"), iv);
  const ciphertext = Buffer.concat([cipher.update(plainIqama, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptNationalId(enc: Buffer): string {
  const iv = enc.subarray(0, IV_LENGTH);
  const tag = enc.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = enc.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", deriveKey("encrypt"), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

// What a screen is allowed to show. Until the directory existed the Iqama was
// decrypted in exactly one place — printed onto the certificate PDF — and
// displayed to nobody. A profile needs enough to match a person against a
// paper record or an SEC list, which is the last four digits and no more;
// anything longer ends up in a CSV export somebody emails.
//
// Returns null rather than throwing on a bad ciphertext: one unreadable row
// must not take down a directory page, and "no number on file" is the honest
// thing to render.
export function maskNationalId(enc: Buffer | null | undefined): string | null {
  if (!enc || enc.length === 0) return null;
  try {
    const plain = decryptNationalId(enc);
    if (plain.length <= 4) return "•".repeat(plain.length);
    return "•".repeat(plain.length - 4) + plain.slice(-4);
  } catch {
    return null;
  }
}
