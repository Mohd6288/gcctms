import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import { companies, profiles, trainers } from "../../db/schema";

// Proves the custom_access_token_hook (0015_custom_access_token_hook.sql)
// actually injects the right claims end-to-end: real GoTrue password
// sign-in against the local Supabase Auth API, not a synthesized JWT like
// the Phase 1 RLS suite uses — this is the one test in the repo that
// exercises the hook itself rather than assuming it works.
//
// Well-known fixed local dev values `supabase start` always prints — not
// real secrets, safe to inline (see ci.yml, docs/residency.md).
const API_URL = "http://127.0.0.1:54321";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const PASSWORD = "Correct-Horse-Battery-Staple-9";

describe("custom_access_token_hook — real login resolves correct claims for all four roles", () => {
  const suffix = randomUUID().slice(0, 8);
  const admin: SupabaseClient = createClient(API_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let companyId: number;
  let trainerId: number;
  const userIds: Record<string, string> = {};

  async function createLoginUser(email: string) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error || !data.user) throw error ?? new Error("createUser failed");
    return data.user.id;
  }

  beforeAll(async () => {
    userIds.superAdmin = await createLoginUser(`super-admin-${suffix}@example.com`);
    userIds.platformAdmin = await createLoginUser(`platform-admin-${suffix}@example.com`);
    userIds.trainer = await createLoginUser(`trainer-${suffix}@example.com`);
    userIds.contractor = await createLoginUser(`contractor-${suffix}@example.com`);

    const [company] = await db
      .insert(companies)
      .values({
        name: "Auth Claims Test Contractor",
        crNumber: `CR-CLAIMS-${suffix}`,
        contactName: "Contact",
        contactEmail: `contact-${suffix}@example.com`,
        contactPhone: "0500000000",
        ownerUserId: userIds.contractor,
      })
      .returning({ id: companies.id });
    companyId = company.id;

    const [trainer] = await db
      .insert(trainers)
      .values({ userId: userIds.trainer, fullName: "Test Trainer" })
      .returning({ id: trainers.id });
    trainerId = trainer.id;

    await db.insert(profiles).values([
      { userId: userIds.superAdmin, role: "super_admin", fullName: "Test Super Admin" },
      { userId: userIds.platformAdmin, role: "platform_admin", fullName: "Test Platform Admin" },
      { userId: userIds.trainer, role: "trainer", fullName: "Test Trainer", trainerId },
      { userId: userIds.contractor, role: "contractor_manager", fullName: "Test Contractor", companyId },
    ]);
  });

  afterAll(async () => {
    await db.delete(profiles).where(eq(profiles.userId, userIds.superAdmin));
    await db.delete(profiles).where(eq(profiles.userId, userIds.platformAdmin));
    await db.delete(profiles).where(eq(profiles.userId, userIds.trainer));
    await db.delete(profiles).where(eq(profiles.userId, userIds.contractor));
    await db.delete(trainers).where(eq(trainers.id, trainerId));
    await db.delete(companies).where(eq(companies.id, companyId));
    for (const id of Object.values(userIds)) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  async function signInAndGetClaims(email: string) {
    const client = createClient(API_URL, ANON_KEY);
    const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    expect(signInError).toBeNull();
    const { data, error } = await client.auth.getClaims();
    expect(error).toBeNull();
    return data!.claims as Record<string, unknown>;
  }

  it("super_admin: user_role claim set, no company_id/trainer_id", async () => {
    const claims = await signInAndGetClaims(`super-admin-${suffix}@example.com`);
    expect(claims.user_role).toBe("super_admin");
    expect(claims.company_id).toBeUndefined();
    expect(claims.trainer_id).toBeUndefined();
  });

  it("platform_admin: user_role claim set, no company_id/trainer_id", async () => {
    const claims = await signInAndGetClaims(`platform-admin-${suffix}@example.com`);
    expect(claims.user_role).toBe("platform_admin");
    expect(claims.company_id).toBeUndefined();
    expect(claims.trainer_id).toBeUndefined();
  });

  it("trainer: user_role + trainer_id claims set, no company_id", async () => {
    const claims = await signInAndGetClaims(`trainer-${suffix}@example.com`);
    expect(claims.user_role).toBe("trainer");
    expect(claims.trainer_id).toBe(trainerId);
    expect(claims.company_id).toBeUndefined();
  });

  it("contractor_manager: user_role + company_id claims set, no trainer_id", async () => {
    const claims = await signInAndGetClaims(`contractor-${suffix}@example.com`);
    expect(claims.user_role).toBe("contractor_manager");
    expect(claims.company_id).toBe(companyId);
    expect(claims.trainer_id).toBeUndefined();
  });
});
