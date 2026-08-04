import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import { companies, courses, jobRoles } from "../../db/schema";
import { listActiveJobRoles } from "../../modules/employees/queries";
import { listActiveCourses } from "../../modules/requests/queries";

// Matches the validated prototype's exact (and deliberately asymmetric)
// filtering logic — Step1Info.tsx for courses, EmployeeFormDialog.tsx for
// job roles. See requests/queries.ts and employees/queries.ts for the
// per-function rationale.
describe("contractor category filtering — real DB", () => {
  const suffix = randomUUID().slice(0, 8);
  const ownerNoCategoryId = randomUUID();
  const ownerDistributionId = randomUUID();
  let companyNoCategoryId: number;
  let companyDistributionId: number;
  let universalCourseId: number;
  let distributionCourseId: number;
  let transmissionCourseId: number;
  let universalRoleId: number;
  let distributionRoleId: number;
  let transmissionRoleId: number;

  beforeAll(async () => {
    await db.execute(sql`insert into auth.users (id) values (${ownerNoCategoryId}), (${ownerDistributionId})`);

    const [companyNoCategory] = await db
      .insert(companies)
      .values({
        name: "No Category Contractor",
        crNumber: `CR-CAT-NONE-${suffix}`,
        contactName: "Contact",
        contactEmail: `cat-none-${suffix}@example.com`,
        contactPhone: "0500000001",
        ownerUserId: ownerNoCategoryId,
      })
      .returning({ id: companies.id });
    companyNoCategoryId = companyNoCategory.id;

    const [companyDistribution] = await db
      .insert(companies)
      .values({
        name: "Distribution Contractor",
        crNumber: `CR-CAT-DIST-${suffix}`,
        contactName: "Contact",
        contactEmail: `cat-dist-${suffix}@example.com`,
        contactPhone: "0500000002",
        ownerUserId: ownerDistributionId,
        contractorCategory: "Distribution",
      })
      .returning({ id: companies.id });
    companyDistributionId = companyDistribution.id;

    const [universalCourse] = await db
      .insert(courses)
      .values({ code: `CAT-U-${suffix}`, titleEn: "Universal Course", titleAr: "دورة عامة", durationHours: "8" })
      .returning({ id: courses.id });
    universalCourseId = universalCourse.id;

    const [distributionCourse] = await db
      .insert(courses)
      .values({ code: `CAT-D-${suffix}`, titleEn: "Distribution Course", titleAr: "دورة توزيع", durationHours: "8", contractorCategory: "Distribution" })
      .returning({ id: courses.id });
    distributionCourseId = distributionCourse.id;

    const [transmissionCourse] = await db
      .insert(courses)
      .values({ code: `CAT-T-${suffix}`, titleEn: "Transmission Course", titleAr: "دورة نقل", durationHours: "8", contractorCategory: "Transmission" })
      .returning({ id: courses.id });
    transmissionCourseId = transmissionCourse.id;

    const [universalRole] = await db
      .insert(jobRoles)
      .values({ code: `CAT-ROLE-U-${suffix}`, nameEn: "Universal Role", nameAr: "دور عام" })
      .returning({ id: jobRoles.id });
    universalRoleId = universalRole.id;

    const [distributionRole] = await db
      .insert(jobRoles)
      .values({ code: `CAT-ROLE-D-${suffix}`, nameEn: "Distribution Role", nameAr: "دور توزيع", contractorCategory: "Distribution" })
      .returning({ id: jobRoles.id });
    distributionRoleId = distributionRole.id;

    const [transmissionRole] = await db
      .insert(jobRoles)
      .values({ code: `CAT-ROLE-T-${suffix}`, nameEn: "Transmission Role", nameAr: "دور نقل", contractorCategory: "Transmission" })
      .returning({ id: jobRoles.id });
    transmissionRoleId = transmissionRole.id;
  });

  afterAll(async () => {
    await db.delete(courses).where(sql`id in (${universalCourseId}, ${distributionCourseId}, ${transmissionCourseId})`);
    await db.delete(jobRoles).where(sql`id in (${universalRoleId}, ${distributionRoleId}, ${transmissionRoleId})`);
    await db.delete(companies).where(sql`id in (${companyNoCategoryId}, ${companyDistributionId})`);
    await db.execute(sql`delete from auth.users where id in (${ownerNoCategoryId}, ${ownerDistributionId})`);
  });

  it("courses: a company with no category sees only universal (uncategorized) courses", async () => {
    const list = await listActiveCourses(companyNoCategoryId);
    const ids = list.map((c) => c.id);
    expect(ids).toContain(universalCourseId);
    expect(ids).not.toContain(distributionCourseId);
    expect(ids).not.toContain(transmissionCourseId);
  });

  it("courses: a company with a category sees universal courses plus exact-matching ones", async () => {
    const list = await listActiveCourses(companyDistributionId);
    const ids = list.map((c) => c.id);
    expect(ids).toContain(universalCourseId);
    expect(ids).toContain(distributionCourseId);
    expect(ids).not.toContain(transmissionCourseId);
  });

  it("job roles: a company with no category sees the full unfiltered role list (asymmetric from courses)", async () => {
    const list = await listActiveJobRoles(companyNoCategoryId);
    const ids = list.map((r) => r.id);
    expect(ids).toContain(universalRoleId);
    expect(ids).toContain(distributionRoleId);
    expect(ids).toContain(transmissionRoleId);
  });

  it("job roles: a company with a category sees ONLY exact-matching roles, no universal fallback", async () => {
    const list = await listActiveJobRoles(companyDistributionId);
    const ids = list.map((r) => r.id);
    expect(ids).toContain(distributionRoleId);
    expect(ids).not.toContain(transmissionRoleId);
    expect(ids).not.toContain(universalRoleId);
  });
});
