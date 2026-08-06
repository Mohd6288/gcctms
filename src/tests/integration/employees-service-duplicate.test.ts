import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import { companies, employees, jobRoles } from "../../db/schema";
import { createEmployee } from "../../modules/employees/service";
import type { AuthContext } from "../../modules/platform/auth/shared";

// Phase 3 acceptance criteria: "a duplicate Iqama insert under a *different*
// company is rejected by the DB" — proven at the raw-DB level already in
// Phase 1's employees-national-id-uniqueness.test.ts. This test exercises
// the actual application path a real contractor uses (employees/service.ts's
// createEmployee, called by the create-employee Server Action), proving the
// friendly error message doesn't leak which other company holds the record,
// and that a contractor can't create an employee under a company they don't own.
describe("createEmployee — global Iqama duplicate via the real service path", () => {
  const suffix = randomUUID().slice(0, 8);
  const ownerAId = randomUUID();
  const ownerBId = randomUUID();
  let companyAId: number;
  let companyBId: number;
  let jobRoleId: number;
  const sharedIqama = "2355566677";

  beforeAll(async () => {
    process.env.NATIONAL_ID_HASH_KEY ??= "test-only-key-do-not-use-in-real-envs";

    await db.execute(sql`insert into auth.users (id) values (${ownerAId}), (${ownerBId})`);

    const [companyA] = await db
      .insert(companies)
      .values({
        name: "Service Test Contractor A",
        crNumber: `CR-SVC-A-${suffix}`,
        contactName: "A Contact",
        contactEmail: `svc-a-${suffix}@example.com`,
        contactPhone: "0500000001",
        ownerUserId: ownerAId,
      })
      .returning({ id: companies.id });
    companyAId = companyA.id;

    const [companyB] = await db
      .insert(companies)
      .values({
        name: "Service Test Contractor B",
        crNumber: `CR-SVC-B-${suffix}`,
        contactName: "B Contact",
        contactEmail: `svc-b-${suffix}@example.com`,
        contactPhone: "0500000002",
        ownerUserId: ownerBId,
      })
      .returning({ id: companies.id });
    companyBId = companyB.id;

    const [jobRole] = await db
      .insert(jobRoles)
      .values({ code: `SVC-ROLE-${suffix}`, nameEn: "Test Role", nameAr: "دور تجريبي" })
      .returning({ id: jobRoles.id });
    jobRoleId = jobRole.id;
  });

  afterAll(async () => {
    await db.delete(employees).where(sql`company_id in (${companyAId}, ${companyBId})`);
    await db.delete(companies).where(sql`id in (${companyAId}, ${companyBId})`);
    await db.delete(jobRoles).where(eq(jobRoles.id, jobRoleId));
    await db.execute(sql`delete from auth.users where id in (${ownerAId}, ${ownerBId})`);
  });

  function contractorContext(userId: string, companyId: number): AuthContext {
    return { userId, role: "contractor_manager", companyId, trainerId: null, region: null, aal: "aal2" };
  }

  it("creates the first employee successfully", async () => {
    const employee = await createEmployee(contractorContext(ownerAId, companyAId), {
      companyId: companyAId,
      fullNameEn: "Employee A",
      fullNameAr: "موظف أ",
      nationalId: sharedIqama,
      jobRoleId,
      email: "",
      phone: "",
    });
    expect(employee.id).toBeTypeOf("number");
  });

  it("rejects a duplicate Iqama under a different company with a friendly, non-leaking message", async () => {
    await expect(
      createEmployee(contractorContext(ownerBId, companyBId), {
        companyId: companyBId,
        fullNameEn: "Employee B",
        fullNameAr: "موظف ب",
        nationalId: sharedIqama,
        jobRoleId,
        email: "",
        phone: "",
      })
    ).rejects.toThrow("This national ID is already registered in the system.");
  });

  it("rejects a contractor creating an employee under a company they don't own", async () => {
    await expect(
      createEmployee(contractorContext(ownerBId, companyBId), {
        companyId: companyAId, // not the caller's own company
        fullNameEn: "Cross-tenant attempt",
        fullNameAr: "محاولة عبر الشركات",
        nationalId: "2399988877",
        jobRoleId,
        email: "",
        phone: "",
      })
    ).rejects.toThrow("Not authorized");
  });
});
