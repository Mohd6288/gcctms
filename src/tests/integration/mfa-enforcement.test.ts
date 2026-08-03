import { createHmac, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import { profiles } from "../../db/schema";

// Proves the real aal1 -> aal2 TOTP mechanics work end-to-end against local
// Supabase Auth: enroll a factor, generate a valid code from its secret
// (RFC 6238, implemented below — no user ever types this by hand, so
// there's no code to intercept from a UI), verify it, and confirm the
// session actually reaches aal2. Also proves the un-skippable half of "MFA
// enforced for privileged roles, skippable only for contractor_manager":
// a fresh sign-in after enrollment sits at aal1 with nextLevel aal2 until
// challenged again — this is exactly what src/modules/platform/auth/
// service.ts's requireRole() checks to force /mfa/challenge.

const API_URL = "http://127.0.0.1:54321";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const PASSWORD = "Correct-Horse-Battery-Staple-9";

function base32Decode(base32: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of base32.replace(/=+$/, "").toUpperCase()) {
    const val = alphabet.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function generateTotp(base32Secret: string, timeStepSeconds = 30, digits = 6): string {
  const key = base32Decode(base32Secret);
  const counter = Math.floor(Date.now() / 1000 / timeStepSeconds);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (binCode % 10 ** digits).toString().padStart(digits, "0");
}

describe("MFA (TOTP) enforcement — aal1 to aal2 over the real Supabase Auth API", () => {
  const suffix = randomUUID().slice(0, 8);
  const email = `mfa-test-${suffix}@example.com`;
  const admin: SupabaseClient = createClient(API_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let userId: string;
  let totpSecret: string;

  beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error || !data.user) throw error ?? new Error("createUser failed");
    userId = data.user.id;
    await db.insert(profiles).values({ userId, role: "platform_admin", fullName: "MFA Test Admin" });
  });

  afterAll(async () => {
    await db.delete(profiles).where(eq(profiles.userId, userId));
    await admin.auth.admin.deleteUser(userId);
  });

  it("starts at aal1 with no factor enrolled", async () => {
    const client = createClient(API_URL, ANON_KEY);
    await client.auth.signInWithPassword({ email, password: PASSWORD });
    const { data } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    expect(data?.currentLevel).toBe("aal1");
    expect(data?.nextLevel).toBe("aal1");
  });

  it("enrolls a TOTP factor and reaches aal2 after verifying a real generated code", async () => {
    const client = createClient(API_URL, ANON_KEY);
    await client.auth.signInWithPassword({ email, password: PASSWORD });

    const { data: enrollData, error: enrollError } = await client.auth.mfa.enroll({ factorType: "totp" });
    expect(enrollError).toBeNull();
    expect(enrollData?.totp.secret).toBeTruthy();
    totpSecret = enrollData!.totp.secret;

    const code = generateTotp(totpSecret);
    const { error: verifyError } = await client.auth.mfa.challengeAndVerify({ factorId: enrollData!.id, code });
    expect(verifyError).toBeNull();

    const { data: aal } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    expect(aal?.currentLevel).toBe("aal2");
  });

  it("a fresh sign-in after enrollment sits at aal1 until re-challenged — cannot skip", async () => {
    const client = createClient(API_URL, ANON_KEY);
    await client.auth.signInWithPassword({ email, password: PASSWORD });

    // A verified factor exists from the previous test, but this is a brand
    // new session — it must start back at aal1 with a pending aal2 step.
    // This is exactly the state src/modules/platform/auth/service.ts's
    // requireRole() detects to force a redirect to /mfa/challenge (never
    // /mfa/enroll, since listFactors() below finds a verified factor).
    const { data: aal } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    expect(aal?.currentLevel).toBe("aal1");
    expect(aal?.nextLevel).toBe("aal2");

    const { data: factors } = await client.auth.mfa.listFactors();
    const verified = factors?.totp.find((f) => f.status === "verified");
    expect(verified).toBeTruthy();

    // Complete a real second challenge (TOTP, not a one-time code — the
    // same secret produces a new valid code on demand) and confirm it
    // actually lifts this new session to aal2.
    const code = generateTotp(totpSecret);
    const { error: verifyError } = await client.auth.mfa.challengeAndVerify({ factorId: verified!.id, code });
    expect(verifyError).toBeNull();

    const { data: aalAfter } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    expect(aalAfter?.currentLevel).toBe("aal2");
  });
});
