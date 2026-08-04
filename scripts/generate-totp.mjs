#!/usr/bin/env node
// Generates the current valid 6-digit TOTP code from a base32 secret — for
// local manual testing without a phone authenticator app. Grab the secret
// once from the "Can't scan? Enter this code manually" text on /mfa/enroll,
// save it as DEV_TOTP_SECRET in .env.local, and every future login is just
// `npm run totp` (defaults to --watch) — no more re-pasting the secret.
// Same RFC 6238 algorithm as tests/integration/mfa-enforcement.test.ts.
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

function readDevTotpSecretFromEnvLocal() {
  const path = join(dirname(fileURLToPath(import.meta.url)), "..", ".env.local");
  try {
    const match = readFileSync(path, "utf8").match(/^DEV_TOTP_SECRET=(.+)$/m);
    return match?.[1]?.trim();
  } catch {
    return undefined;
  }
}

const secret = process.argv[2] ?? process.env.DEV_TOTP_SECRET ?? readDevTotpSecretFromEnvLocal();
if (!secret) {
  console.error("Usage: node scripts/generate-totp.mjs <base32-secret>\nOr save it once: add DEV_TOTP_SECRET=<base32-secret> to .env.local, then just run `npm run totp`.");
  process.exit(1);
}

function base32Decode(base32) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of base32.replace(/=+$/, "").toUpperCase()) {
    const val = alphabet.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function generateTotp(base32Secret, timeStepSeconds = 30, digits = 6) {
  const key = base32Decode(base32Secret);
  const counter = Math.floor(Date.now() / 1000 / timeStepSeconds);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return (binCode % 10 ** digits).toString().padStart(digits, "0");
}

function printCurrentCode() {
  const code = generateTotp(secret);
  const secondsLeft = 30 - (Math.floor(Date.now() / 1000) % 30);
  process.stdout.write(`\r${code}  (valid for ~${secondsLeft.toString().padStart(2, " ")}s)   `);
}

if (process.argv.includes("--once")) {
  printCurrentCode();
  console.log("");
} else {
  console.log("Watching — leave this running, copy whichever code is current right before you submit. Ctrl+C to stop.\n");
  setInterval(printCurrentCode, 1000);
  printCurrentCode();
}
