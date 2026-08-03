import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../../db";
import {
  classes,
  companies,
  courses,
  employees,
  jobRoles,
  payments,
  pricing,
  trainers,
  trainingRequests,
} from "../../db/schema";
import { encryptNationalId, hashNationalId } from "../../modules/platform/security/national-id";
import { withRole } from "./with-role";

// Release gate from database-schema.md / roles-and-workflows.md: signs in as
// each of the four roles (via synthesized JWT claims — see withRole.ts, the
// same request.jwt.claims mechanism auth.jwt()/auth_role()/
// auth_company_id() read in every policy) against the REAL local Supabase
// Postgres, and proves at the database — not the app layer — that:
//   1. contractor_manager/trainer cross-tenant access to companies/employees
//      is denied.
//   2. super_admin's blanket RLS access is scoped to catalog/pricing only,
//      NOT requests/payments/classes (a deliberate, easy-to-regress design
//      choice — see roles-and-workflows.md's role split).

describe("RLS isolation — four fake role users, real database", () => {
  const suffix = randomUUID().slice(0, 8);
  const ownerAId = randomUUID();
  const ownerBId = randomUUID();
  const trainerUserId = randomUUID();
  let companyAId: number;
  let companyBId: number;
  let jobRoleId: number;
  let courseId: number;
  let trainerId: number;
  let requestId: number;

  beforeAll(async () => {
    process.env.NATIONAL_ID_HASH_KEY ??= "test-only-key-do-not-use-in-real-envs";

    await db.execute(
      sql`insert into auth.users (id) values (${ownerAId}), (${ownerBId}), (${trainerUserId})`
    );

    const [companyA] = await db
      .insert(companies)
      .values({
        name: "RLS Test Contractor A",
        crNumber: `CR-RLS-A-${suffix}`,
        contactName: "A Contact",
        contactEmail: `rls-a-${suffix}@example.com`,
        contactPhone: "0500000001",
        ownerUserId: ownerAId,
      })
      .returning({ id: companies.id });
    companyAId = companyA.id;

    const [companyB] = await db
      .insert(companies)
      .values({
        name: "RLS Test Contractor B",
        crNumber: `CR-RLS-B-${suffix}`,
        contactName: "B Contact",
        contactEmail: `rls-b-${suffix}@example.com`,
        contactPhone: "0500000002",
        ownerUserId: ownerBId,
      })
      .returning({ id: companies.id });
    companyBId = companyB.id;

    const [jobRole] = await db
      .insert(jobRoles)
      .values({ code: `RLS-ROLE-${suffix}`, nameEn: "Test Role", nameAr: "دور تجريبي" })
      .returning({ id: jobRoles.id });
    jobRoleId = jobRole.id;

    await db.insert(employees).values([
      {
        companyId: companyAId,
        fullNameEn: "Employee A",
        fullNameAr: "موظف أ",
        nationalIdEnc: encryptNationalId("2311111111"),
        nationalIdHash: hashNationalId("2311111111"),
        jobRoleId,
      },
      {
        companyId: companyBId,
        fullNameEn: "Employee B",
        fullNameAr: "موظف ب",
        nationalIdEnc: encryptNationalId("2322222222"),
        nationalIdHash: hashNationalId("2322222222"),
        jobRoleId,
      },
    ]);

    const [course] = await db
      .insert(courses)
      .values({ code: `RLS-CSCC-${suffix}`, titleEn: "Test Course", titleAr: "دورة تجريبية", durationHours: "8" })
      .returning({ id: courses.id });
    courseId = course.id;

    await db.insert(pricing).values({ courseId, price: "500.00", effectiveFrom: "2026-01-01" });

    const [trainer] = await db
      .insert(trainers)
      .values({ userId: trainerUserId, fullName: "Test Trainer" })
      .returning({ id: trainers.id });
    trainerId = trainer.id;

    await db.insert(classes).values({
      courseId,
      trainerId,
      region: "Central",
      type: "public",
      startDate: "2026-08-01",
      endDate: "2026-08-02",
      capacity: 20,
    });

    const [request] = await db
      .insert(trainingRequests)
      .values({ companyId: companyAId, requestedBy: ownerAId, courseId })
      .returning({ id: trainingRequests.id });
    requestId = request.id;

    await db.insert(payments).values({
      requestId,
      description: "Test invoice",
      qty: 1,
      unitPrice: "500.00",
    });
  });

  afterAll(async () => {
    await db.delete(payments).where(sql`request_id = ${requestId}`);
    await db.delete(trainingRequests).where(sql`id = ${requestId}`);
    await db.delete(classes).where(sql`course_id = ${courseId}`);
    await db.delete(trainers).where(sql`id = ${trainerId}`);
    await db.delete(pricing).where(sql`course_id = ${courseId}`);
    await db.delete(courses).where(sql`id = ${courseId}`);
    await db.delete(employees).where(sql`company_id in (${companyAId}, ${companyBId})`);
    await db.delete(companies).where(sql`id in (${companyAId}, ${companyBId})`);
    await db.delete(jobRoles).where(sql`id = ${jobRoleId}`);
    await db.execute(sql`delete from auth.users where id in (${ownerAId}, ${ownerBId}, ${trainerUserId})`);
  });

  describe("contractor_manager — cross-tenant isolation on companies/employees", () => {
    const claimsA = { sub: ownerAId, role: "authenticated", user_role: "contractor_manager", company_id: 0 };

    it("sees only its own company via SELECT, never the other company", async () => {
      const rows = await withRole({ ...claimsA, company_id: companyAId }, (tx) => tx.select().from(companies));
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(companyAId);
      expect(ids).not.toContain(companyBId);
    });

    it("sees only its own employees via SELECT, never the other company's", async () => {
      const rows = await withRole({ ...claimsA, company_id: companyAId }, (tx) => tx.select().from(employees));
      const companyIds = new Set(rows.map((r) => r.companyId));
      expect(companyIds.has(companyAId)).toBe(true);
      expect(companyIds.has(companyBId)).toBe(false);
    });

    it("is denied by the database when INSERTing an employee under a different company", async () => {
      await expect(
        withRole({ ...claimsA, company_id: companyAId }, (tx) =>
          tx.insert(employees).values({
            companyId: companyBId, // not the caller's own company
            fullNameEn: "Cross-tenant attempt",
            fullNameAr: "محاولة عبر الشركات",
            nationalIdEnc: encryptNationalId("2399999999"),
            nationalIdHash: hashNationalId("2399999999"),
            jobRoleId,
          })
        )
      ).rejects.toMatchObject({ cause: { code: "42501" } }); // insufficient_privilege (RLS policy violation)
    });
  });

  describe("trainer — no access to companies/employees outside their own class rosters", () => {
    const claimsTrainer = { sub: trainerUserId, role: "authenticated", user_role: "trainer", trainer_id: 0 };

    it("SELECT on companies returns nothing (no policy grants trainer any row)", async () => {
      const rows = await withRole({ ...claimsTrainer, trainer_id: trainerId }, (tx) => tx.select().from(companies));
      expect(rows).toHaveLength(0);
    });

    it("SELECT on employees returns nothing without a matching class-roster join", async () => {
      const rows = await withRole({ ...claimsTrainer, trainer_id: trainerId }, (tx) => tx.select().from(employees));
      expect(rows).toHaveLength(0);
    });
  });

  describe("platform_admin — full operational access (sanity check)", () => {
    const claimsAdmin = { sub: randomUUID(), role: "authenticated", user_role: "platform_admin" };

    it("SELECT on companies returns both companies", async () => {
      const rows = await withRole(claimsAdmin, (tx) => tx.select().from(companies));
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(companyAId);
      expect(ids).toContain(companyBId);
    });
  });

  describe("super_admin — blanket access scoped to catalog/pricing only", () => {
    const claimsSuperAdmin = { sub: randomUUID(), role: "authenticated", user_role: "super_admin" };

    it("CAN read catalog tables (courses, pricing)", async () => {
      const courseRows = await withRole(claimsSuperAdmin, (tx) => tx.select().from(courses));
      const pricingRows = await withRole(claimsSuperAdmin, (tx) => tx.select().from(pricing));
      expect(courseRows.map((r) => r.id)).toContain(courseId);
      expect(pricingRows.some((r) => r.courseId === courseId)).toBe(true);
    });

    it("CANNOT read companies or employees (no blanket policy)", async () => {
      const companyRows = await withRole(claimsSuperAdmin, (tx) => tx.select().from(companies));
      const employeeRows = await withRole(claimsSuperAdmin, (tx) => tx.select().from(employees));
      expect(companyRows).toHaveLength(0);
      expect(employeeRows).toHaveLength(0);
    });

    it("CANNOT read training_requests, payments, or classes", async () => {
      const requestRows = await withRole(claimsSuperAdmin, (tx) => tx.select().from(trainingRequests));
      const paymentRows = await withRole(claimsSuperAdmin, (tx) => tx.select().from(payments));
      const classRows = await withRole(claimsSuperAdmin, (tx) => tx.select().from(classes));
      expect(requestRows).toHaveLength(0);
      expect(paymentRows).toHaveLength(0);
      expect(classRows).toHaveLength(0);
    });
  });
});
