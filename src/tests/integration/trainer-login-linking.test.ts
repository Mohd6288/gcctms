import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import { profiles, trainers } from "../../db/schema";
import { createAllTrainerLogins, createTrainerLogin } from "../../modules/catalog/service";
import type { AuthContext } from "../../modules/platform/auth/shared";

// The 13 trainers seeded from files_TMS/tainers.xlsx exist with user_id
// null: roster records carrying course competencies, no accounts.
// createTrainer() INSERTS a trainer, so using it to give one of them a login
// produced a duplicate — one row with the account, another with the
// qualifications, both showing the same name in scheduling. This links the
// account to the row that already exists.
const API_URL = "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

describe("createTrainerLogin — links an account to an existing roster trainer", () => {
  const suffix = randomUUID().slice(0, 8);
  const email = `roster-trainer-${suffix}@example.com`;
  const admin: SupabaseClient = createClient(API_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  // A real auth.users row: writeAudit's user_id is a foreign key onto it.
  const superAdminId = randomUUID();
  const superAdminCtx: AuthContext = { userId: superAdminId, role: "super_admin", companyId: null, trainerId: null, region: null, aal: "aal2" };
  let trainerId: number;
  let createdUserId: string | null = null;

  beforeAll(async () => {
    await db.execute(sql`insert into auth.users (id) values (${superAdminId})`);
    const [trainer] = await db
      .insert(trainers)
      .values({ fullName: "Roster Only Trainer", email, active: true })
      .returning({ id: trainers.id });
    trainerId = trainer.id;
  });

  afterAll(async () => {
    if (createdUserId) {
      await db.delete(profiles).where(eq(profiles.userId, createdUserId));
      await admin.auth.admin.deleteUser(createdUserId);
    }
    await db.delete(trainers).where(eq(trainers.id, trainerId));
    await db.execute(sql`delete from audit_log where user_id = ${superAdminId}`);
    await db.execute(sql`delete from auth.users where id = ${superAdminId}`);
  });

  it("sets user_id on the existing row instead of inserting a second trainer", async () => {
    const before = await db.select({ id: trainers.id }).from(trainers).where(eq(trainers.email, email));
    expect(before).toHaveLength(1);

    const result = await createTrainerLogin(superAdminCtx, { trainerId });
    expect(result.email).toBe(email);
    expect(result.tempPassword.length).toBeGreaterThan(10);

    const after = await db.select({ id: trainers.id, userId: trainers.userId }).from(trainers).where(eq(trainers.email, email));
    expect(after).toHaveLength(1); // no duplicate
    expect(after[0].id).toBe(trainerId); // the SAME row, competencies intact
    expect(after[0].userId).not.toBeNull();
    createdUserId = after[0].userId;

    // The profile points back at the original trainer, so the JWT's
    // trainer_id claim resolves to the row holding the competencies.
    const [profile] = await db.select().from(profiles).where(eq(profiles.userId, createdUserId!));
    expect(profile.role).toBe("trainer");
    expect(profile.trainerId).toBe(trainerId);
  });

  it("refuses a trainer who already has a login", async () => {
    await expect(createTrainerLogin(superAdminCtx, { trainerId })).rejects.toThrow("already has a login");
  });

  it("refuses a trainer with no email to match on", async () => {
    const [noEmail] = await db
      .insert(trainers)
      .values({ fullName: "No Email Trainer", active: true })
      .returning({ id: trainers.id });
    await expect(createTrainerLogin(superAdminCtx, { trainerId: noEmail.id })).rejects.toThrow("Add an email");
    await db.delete(trainers).where(eq(trainers.id, noEmail.id));
  });

  // The roster is onboarded in one go rather than one click per trainer,
  // and each temp password is shown exactly once — so a partial failure must
  // report per trainer instead of aborting the batch.
  it("creates logins for every rostered trainer that still needs one, and is a no-op on re-run", async () => {
    const emailA = `bulk-a-${suffix}@example.com`;
    const emailB = `bulk-b-${suffix}@example.com`;
    const [a] = await db.insert(trainers).values({ fullName: "Bulk A", email: emailA, active: true }).returning({ id: trainers.id });
    const [b] = await db.insert(trainers).values({ fullName: "Bulk B", email: emailB, active: true }).returning({ id: trainers.id });
    const [noEmail] = await db.insert(trainers).values({ fullName: "Bulk No Email", active: true }).returning({ id: trainers.id });

    const result = await createAllTrainerLogins(superAdminCtx);
    const createdEmails = result.created.map((c) => c.email);
    expect(createdEmails).toContain(emailA);
    expect(createdEmails).toContain(emailB);
    // No email to match on, so it isn't even a candidate.
    expect(result.created.some((c) => c.fullName === "Bulk No Email")).toBe(false);
    expect(result.failed).toEqual([]);

    const linked = await db.select({ id: trainers.id, userId: trainers.userId }).from(trainers).where(inArray(trainers.id, [a.id, b.id]));
    expect(linked.every((t) => t.userId !== null)).toBe(true);

    const rerun = await createAllTrainerLogins(superAdminCtx);
    expect(rerun.created.filter((c) => c.email === emailA || c.email === emailB)).toEqual([]);

    for (const id of [a.id, b.id]) {
      const [row] = await db.select({ userId: trainers.userId }).from(trainers).where(eq(trainers.id, id));
      if (row.userId) {
        await db.delete(profiles).where(eq(profiles.userId, row.userId));
        await admin.auth.admin.deleteUser(row.userId);
      }
    }
    await db.delete(trainers).where(inArray(trainers.id, [a.id, b.id, noEmail.id]));
  });

  it("refuses a caller who isn't super_admin", async () => {
    const platformAdmin: AuthContext = { userId: randomUUID(), role: "platform_admin", companyId: null, trainerId: null, region: null, aal: "aal2" };
    await expect(createTrainerLogin(platformAdmin, { trainerId })).rejects.toThrow("Not authorized");
  });
});
