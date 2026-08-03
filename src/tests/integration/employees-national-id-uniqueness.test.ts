import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { companies, employees, jobRoles } from "../../db/schema";
import { encryptNationalId, hashNationalId } from "../../modules/platform/security/national-id";

// Proves employees.national_id_hash's UNIQUE constraint is global, not scoped
// to company_id, per roles-and-workflows.md: one Iqama can belong to exactly
// one employee record system-wide, even across different contractor
// employers. Runs against the real local Supabase Postgres — see
// scripts/rls-check.mjs for why synthetic/mocked DB tests aren't trusted here.
describe("employees.national_id_hash global uniqueness", () => {
  const suffix = randomUUID().slice(0, 8);
  const ownerAId = randomUUID();
  const ownerBId = randomUUID();
  let companyAId: number;
  let companyBId: number;
  let jobRoleId: number;
  const sharedIqama = "2312345678";

  beforeAll(async () => {
    process.env.NATIONAL_ID_HASH_KEY ??= "test-only-key-do-not-use-in-real-envs";

    // auth.users fixtures — Phase 2's real signup flow doesn't exist yet, so
    // seed the minimal row companies.owner_user_id's FK requires.
    await db.execute(sql`insert into auth.users (id) values (${ownerAId}), (${ownerBId})`);

    const [jobRole] = await db
      .insert(jobRoles)
      .values({ code: `TEST-ROLE-${suffix}`, nameEn: "Test Role", nameAr: "دور تجريبي" })
      .returning({ id: jobRoles.id });
    jobRoleId = jobRole.id;

    const [companyA] = await db
      .insert(companies)
      .values({
        name: "Test Contractor A",
        crNumber: `CR-A-${suffix}`,
        contactName: "A Contact",
        contactEmail: `a-${suffix}@example.com`,
        contactPhone: "0500000001",
        ownerUserId: ownerAId,
      })
      .returning({ id: companies.id });
    companyAId = companyA.id;

    const [companyB] = await db
      .insert(companies)
      .values({
        name: "Test Contractor B",
        crNumber: `CR-B-${suffix}`,
        contactName: "B Contact",
        contactEmail: `b-${suffix}@example.com`,
        contactPhone: "0500000002",
        ownerUserId: ownerBId,
      })
      .returning({ id: companies.id });
    companyBId = companyB.id;
  });

  afterAll(async () => {
    await db.delete(employees).where(eq(employees.companyId, companyAId));
    await db.delete(employees).where(eq(employees.companyId, companyBId));
    await db.delete(companies).where(eq(companies.id, companyAId));
    await db.delete(companies).where(eq(companies.id, companyBId));
    await db.delete(jobRoles).where(eq(jobRoles.id, jobRoleId));
    await db.execute(sql`delete from auth.users where id in (${ownerAId}, ${ownerBId})`);
  });

  it("allows the first employee with a given Iqama", async () => {
    const [employee] = await db
      .insert(employees)
      .values({
        companyId: companyAId,
        fullNameEn: "Employee A",
        fullNameAr: "موظف أ",
        nationalIdEnc: encryptNationalId(sharedIqama),
        nationalIdHash: hashNationalId(sharedIqama),
        jobRoleId,
      })
      .returning({ id: employees.id });
    expect(employee.id).toBeTypeOf("number");
  });

  it("rejects a second employee under a DIFFERENT company with the same Iqama, at the database", async () => {
    await expect(
      db.insert(employees).values({
        companyId: companyBId,
        fullNameEn: "Employee B (duplicate Iqama)",
        fullNameAr: "موظف ب",
        nationalIdEnc: encryptNationalId(sharedIqama),
        nationalIdHash: hashNationalId(sharedIqama),
        jobRoleId,
      })
    ).rejects.toMatchObject({ cause: { code: "23505" } }); // Postgres unique_violation
  });
});
