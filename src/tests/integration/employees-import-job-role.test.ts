import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import { companies, employees, jobRoles } from "../../db/schema";
import { importEmployees } from "../../modules/employees/service";
import type { AuthContext } from "../../modules/platform/auth/shared";

// The job-title column on both real intake forms is free text copied off the
// candidate's Iqama — "المهنة طبقا للإقامة" on HRBL_0004_FO_001, "المهنة
// المسجلة بالهوية / Job" on the Registration Sheet. Real files carry values
// like "Electrical, Engineer", "TECHNICIAN, ELECTRICAL" and "مهندس كهربائي",
// none of which equal a canonical job_roles.name_en. Matching on exact name
// alone therefore drops every row of a genuine form — the contractor sees
// "0 employee(s) imported" with one skip per candidate.
describe("importEmployees — job role resolution from real intake forms", () => {
  const suffix = randomUUID().slice(0, 8);
  const ownerId = randomUUID();
  let companyId: number;
  let electricianRoleId: number;
  let assistantRoleId: number;
  let contractorCtx: AuthContext;

  // Straight out of some_doc/test_files — the values a contractor actually
  // uploaded, not invented ones.
  const REAL_FORM_ROWS = [
    { fullName: "Sathis Kumar Sivanesan", nationalId: "2342973126", jobTitleText: "Electrical, Engineer" },
    { fullName: "Muhammad Sheraz Naseer Ahmed", nationalId: "2551765213", jobTitleText: "TECHNICIAN, ELECTRICAL" },
    { fullName: "Mohammad Umair Farooq", nationalId: "2315774881", jobTitleText: "مهندس كهربائي" },
  ];

  beforeAll(async () => {
    process.env.NATIONAL_ID_HASH_KEY ??= "test-only-key-do-not-use-in-real-envs";
    await db.execute(sql`insert into auth.users (id) values (${ownerId})`);

    const [company] = await db
      .insert(companies)
      .values({
        name: "Import Job Role Test Contractor",
        crNumber: `CR-IMP-${suffix}`,
        contactName: "Contact",
        contactEmail: `imp-${suffix}@example.com`,
        contactPhone: "0500000001",
        ownerUserId: ownerId,
      })
      .returning({ id: companies.id });
    companyId = company.id;

    const [electrician] = await db
      .insert(jobRoles)
      .values({ code: `IMP-ELEC-${suffix}`, nameEn: "Building Electrician", nameAr: "كهربائي مباني" })
      .returning({ id: jobRoles.id });
    electricianRoleId = electrician.id;

    const [assistant] = await db
      .insert(jobRoles)
      .values({ code: `IMP-ASST-${suffix}`, nameEn: "Electrician Assistant", nameAr: "مساعد كهربائي" })
      .returning({ id: jobRoles.id });
    assistantRoleId = assistant.id;

    contractorCtx = { userId: ownerId, role: "contractor_manager", companyId, trainerId: null, region: null, aal: "aal2" };
  });

  afterAll(async () => {
    await db.delete(employees).where(eq(employees.companyId, companyId));
    await db.delete(companies).where(eq(companies.id, companyId));
    await db.delete(jobRoles).where(sql`id in (${electricianRoleId}, ${assistantRoleId})`);
    await db.execute(sql`delete from auth.users where id = ${ownerId}`);
  });

  it("imports a row whose job role the contractor picked, even when the free text matches nothing", async () => {
    const result = await importEmployees(contractorCtx, companyId, [
      { ...REAL_FORM_ROWS[0], jobRoleId: electricianRoleId },
      { ...REAL_FORM_ROWS[1], jobRoleId: assistantRoleId },
      { ...REAL_FORM_ROWS[2], jobRoleId: electricianRoleId },
    ]);

    expect(result.skipped).toEqual([]);
    expect(result.created).toHaveLength(3);

    const rows = await db.select({ jobRoleId: employees.jobRoleId }).from(employees).where(eq(employees.companyId, companyId));
    expect(rows.map((r) => r.jobRoleId).sort()).toEqual([electricianRoleId, electricianRoleId, assistantRoleId].sort());
  });

  it("still resolves by name when the sheet does happen to carry a canonical role name", async () => {
    const result = await importEmployees(contractorCtx, companyId, [
      { fullName: "Canonical Name Match", nationalId: "2399988877", jobTitleText: "Building Electrician" },
    ]);

    expect(result.skipped).toEqual([]);
    expect(result.created).toHaveLength(1);
  });

  it("resolves by the Arabic role name — the HRBL form's job column is Arabic by definition", async () => {
    const result = await importEmployees(contractorCtx, companyId, [
      { fullName: "Arabic Name Match", nationalId: "2377766655", jobTitleText: "كهربائي مباني" },
    ]);

    expect(result.skipped).toEqual([]);
    expect(result.created).toHaveLength(1);
  });

  it("rejects a job role the caller doesn't get to choose — an id outside the company's allowed roles", async () => {
    const [otherRole] = await db
      .insert(jobRoles)
      .values({ code: `IMP-OTHER-${suffix}`, nameEn: "Some Other Role", nameAr: "دور آخر", active: false })
      .returning({ id: jobRoles.id });

    const result = await importEmployees(contractorCtx, companyId, [
      { fullName: "Inactive Role Attempt", nationalId: "2366655544", jobTitleText: "whatever", jobRoleId: otherRole.id },
    ]);

    expect(result.created).toHaveLength(0);
    expect(result.skipped[0].reason).toMatch(/job title|job role/i);

    await db.delete(jobRoles).where(eq(jobRoles.id, otherRole.id));
  });
});
