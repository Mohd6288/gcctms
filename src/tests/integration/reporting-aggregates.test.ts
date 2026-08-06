import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import {
  certificates,
  classes,
  companies,
  courses,
  employees,
  jobRoles,
  payments,
  requestItems,
  trainers,
  trainingCenters,
  trainingRequests,
} from "../../db/schema";
import { encryptNationalId, hashNationalId } from "../../modules/platform/security/national-id";
import {
  getCertificatesIssuedByMonth,
  getReportSummary,
  getRequestsByRegion,
  getRequestsByStatus,
  getRevenueByCourse,
  getVerifiedRevenueByMonth,
  listRequestYears,
} from "../../modules/reporting/queries";

// Characterization test for the reporting aggregates: pins every number the
// admin Reports page shows, so the pending "34 queries -> ~8" collapse can be
// proven to change performance only, never the figures. These are revenue
// numbers — a silent drift here is worse than a slow page.
//
// Everything is seeded into a far-future month (2031-03) that no other test
// or manual session touches, so period-scoped queries see EXACTLY this
// fixture and can be asserted absolutely. Only the deliberately all-time
// completionRate needs the baseline-delta treatment that
// platform-overview-stats.test.ts uses throughout.
const PERIOD = { mode: "month", value: "2031-03-01" } as const;

describe("reporting aggregates — pinned against a seeded fixture", () => {
  const suffix = randomUUID().slice(0, 8);
  const ownerAId = randomUUID();
  const ownerBId = randomUUID();
  const trainerUserId = randomUUID();

  let companyAId: number;
  let companyBId: number;
  let jobRoleId: number;
  let empA1Id: number;
  let empA2Id: number;
  let empB1Id: number;
  let course1Id: number;
  let course2Id: number;
  let trainerId: number;
  let centerId: number;
  let classId: number;
  let certIssuedId: number;
  let certPendingId: number;
  let reqAId: number;
  let reqBId: number;
  let reqCId: number;
  let payAId: number;
  let payBId: number;

  // All-time counts before seeding, for the completionRate assertion.
  let baseCompleted: number;
  let baseTotal: number;

  async function allTimeRequestCounts() {
    const [row] = await db
      .select({
        completed: sql<number>`count(*) filter (where status = 'completed')`,
        total: sql<number>`count(*)`,
      })
      .from(trainingRequests);
    return { completed: Number(row.completed), total: Number(row.total) };
  }

  beforeAll(async () => {
    const base = await allTimeRequestCounts();
    baseCompleted = base.completed;
    baseTotal = base.total;

    await db.execute(sql`insert into auth.users (id) values (${ownerAId}), (${ownerBId}), (${trainerUserId})`);

    const companyRows = await db
      .insert(companies)
      .values([
        { name: `Reporting Co A ${suffix}`, crNumber: `CR-RPT-A-${suffix}`, contactName: "A", contactEmail: `rpt-a-${suffix}@example.com`, contactPhone: "0500000001", ownerUserId: ownerAId },
        { name: `Reporting Co B ${suffix}`, crNumber: `CR-RPT-B-${suffix}`, contactName: "B", contactEmail: `rpt-b-${suffix}@example.com`, contactPhone: "0500000002", ownerUserId: ownerBId },
      ])
      .returning({ id: companies.id });
    [companyAId, companyBId] = companyRows.map((r) => r.id);

    const [jobRole] = await db
      .insert(jobRoles)
      .values({ code: `RPT-ROLE-${suffix}`, nameEn: "Reporting Role", nameAr: "دور" })
      .returning({ id: jobRoles.id });
    jobRoleId = jobRole.id;

    const empRows = await db
      .insert(employees)
      .values([
        { companyId: companyAId, fullNameEn: "RA1", fullNameAr: "أ1", nationalIdEnc: encryptNationalId("2388800001"), nationalIdHash: hashNationalId("2388800001"), jobRoleId },
        { companyId: companyAId, fullNameEn: "RA2", fullNameAr: "أ2", nationalIdEnc: encryptNationalId("2388800002"), nationalIdHash: hashNationalId("2388800002"), jobRoleId },
        { companyId: companyBId, fullNameEn: "RB1", fullNameAr: "ب1", nationalIdEnc: encryptNationalId("2388800003"), nationalIdHash: hashNationalId("2388800003"), jobRoleId },
      ])
      .returning({ id: employees.id });
    [empA1Id, empA2Id, empB1Id] = empRows.map((r) => r.id);

    const courseRows = await db
      .insert(courses)
      .values([
        { code: `RPT-C1-${suffix}`, titleEn: "Reporting Course 1", titleAr: "دورة ١", durationHours: "8" },
        { code: `RPT-C2-${suffix}`, titleEn: "Reporting Course 2", titleAr: "دورة ٢", durationHours: "8" },
      ])
      .returning({ id: courses.id });
    [course1Id, course2Id] = courseRows.map((r) => r.id);

    const [trainer] = await db.insert(trainers).values({ userId: trainerUserId, fullName: "Reporting Trainer" }).returning({ id: trainers.id });
    trainerId = trainer.id;
    const [center] = await db.insert(trainingCenters).values({ name: `Reporting Center ${suffix}` }).returning({ id: trainingCenters.id });
    centerId = center.id;

    // Far-future dates keep this clear of classes_trainer_no_overlap.
    const [cls] = await db
      .insert(classes)
      .values({ courseId: course1Id, trainerId, centerId, region: "Central", type: "public", startDate: "2031-03-01", endDate: "2031-03-03", capacity: 20 })
      .returning({ id: classes.id });
    classId = cls.id;

    // 3 requests in-period: 2 Central / 1 East, statuses submitted/completed/draft.
    const reqRows = await db
      .insert(trainingRequests)
      .values([
        { companyId: companyAId, requestedBy: ownerAId, courseId: course1Id, preferredRegion: "Central", status: "submitted", createdAt: new Date("2031-03-05T00:00:00Z") },
        { companyId: companyBId, requestedBy: ownerBId, courseId: course2Id, preferredRegion: "East", status: "completed", createdAt: new Date("2031-03-10T00:00:00Z") },
        { companyId: companyAId, requestedBy: ownerAId, courseId: course1Id, preferredRegion: "Central", status: "draft", createdAt: new Date("2031-03-15T00:00:00Z") },
      ])
      .returning({ id: trainingRequests.id });
    [reqAId, reqBId, reqCId] = reqRows.map((r) => r.id);

    // empA2 is rejected -> must NOT count toward activeLearners.
    await db.insert(requestItems).values([
      { requestId: reqAId, employeeId: empA1Id, courseId: course1Id, decision: "approved" },
      { requestId: reqAId, employeeId: empA2Id, courseId: course1Id, decision: "rejected" },
      { requestId: reqBId, employeeId: empB1Id, courseId: course2Id, decision: "approved" },
    ]);

    // total_amount is generated: qty * unit_price * (1 + vat_rate).
    // verified 2 x 500 x 1.15 = 1150.00 ; outstanding 1 x 300 x 1.15 = 345.00
    const payRows = await db
      .insert(payments)
      .values([
        { requestId: reqAId, description: "Verified", qty: 2, unitPrice: "500.00", status: "verified", createdAt: new Date("2031-03-06T00:00:00Z") },
        { requestId: reqBId, description: "Outstanding", qty: 1, unitPrice: "300.00", status: "uploaded", createdAt: new Date("2031-03-11T00:00:00Z") },
      ])
      .returning({ id: payments.id });
    [payAId, payBId] = payRows.map((r) => r.id);

    // Only the issued one counts; the pending one proves the status filter.
    const certRows = await db
      .insert(certificates)
      .values([
        { employeeId: empA1Id, courseId: course1Id, classId, companyId: companyAId, status: "issued", eligibility: {}, issuedAt: new Date("2031-03-20T00:00:00Z") },
        { employeeId: empB1Id, courseId: course2Id, classId, companyId: companyBId, status: "pending_approval", eligibility: {} },
      ])
      .returning({ id: certificates.id });
    [certIssuedId, certPendingId] = certRows.map((r) => r.id);
  });

  afterAll(async () => {
    await db.delete(certificates).where(sql`id in (${certIssuedId}, ${certPendingId})`);
    await db.delete(payments).where(sql`id in (${payAId}, ${payBId})`);
    await db.delete(requestItems).where(sql`request_id in (${reqAId}, ${reqBId}, ${reqCId})`);
    await db.delete(trainingRequests).where(sql`id in (${reqAId}, ${reqBId}, ${reqCId})`);
    await db.delete(classes).where(eq(classes.id, classId));
    await db.delete(trainingCenters).where(eq(trainingCenters.id, centerId));
    await db.delete(trainers).where(eq(trainers.id, trainerId));
    await db.delete(employees).where(sql`id in (${empA1Id}, ${empA2Id}, ${empB1Id})`);
    await db.delete(courses).where(sql`id in (${course1Id}, ${course2Id})`);
    await db.delete(jobRoles).where(eq(jobRoles.id, jobRoleId));
    await db.delete(companies).where(sql`id in (${companyAId}, ${companyBId})`);
    await db.execute(sql`delete from auth.users where id in (${ownerAId}, ${ownerBId}, ${trainerUserId})`);
  });

  it("getReportSummary returns every headline figure exactly", async () => {
    const s = await getReportSummary(PERIOD);

    expect(s.verifiedRevenue).toBeCloseTo(1150, 2);
    expect(s.outstanding).toBeCloseTo(345, 2);
    expect(s.certificatesIssued).toBe(1);
    expect(s.totalRequests).toBe(3);
    expect(s.activeCompanies).toBe(2);
    // empA2's rejected item must not count.
    expect(s.activeLearners).toBe(2);
    // Only course1 earned revenue, so the average is over 1 course.
    expect(s.avgRevenuePerCourse).toBeCloseTo(1150, 2);

    // completionRate is deliberately all-time, not period-scoped.
    const expected = (baseCompleted + 1) / (baseTotal + 3);
    expect(s.completionRate).toBeCloseTo(expected, 10);
  });

  it("getRevenueByCourse attributes revenue to the right course and zero elsewhere", async () => {
    const rows = await getRevenueByCourse(PERIOD);
    const byId = new Map(rows.map((r) => [r.courseId, r.revenue]));

    expect(byId.get(course1Id)).toBeCloseTo(1150, 2);
    // Course 2's only payment is unverified — must be 0, not 345.
    expect(byId.get(course2Id)).toBeCloseTo(0, 2);
  });

  it("getRequestsByRegion returns all 5 regions with in-period counts", async () => {
    const rows = await getRequestsByRegion(PERIOD);
    expect(rows).toHaveLength(5);

    const byRegion = Object.fromEntries(rows.map((r) => [r.region, r.value]));
    expect(byRegion.Central).toBe(2);
    expect(byRegion.East).toBe(1);
    expect(byRegion.North).toBe(0);
    expect(byRegion.South).toBe(0);
    expect(byRegion.West).toBe(0);
  });

  it("getRequestsByStatus returns all 8 statuses with in-period counts", async () => {
    const rows = await getRequestsByStatus(PERIOD);
    expect(rows).toHaveLength(8);

    const byStatus = Object.fromEntries(rows.map((r) => [r.status, r.value]));
    expect(byStatus.submitted).toBe(1);
    expect(byStatus.completed).toBe(1);
    expect(byStatus.draft).toBe(1);
    expect(byStatus.rejected).toBe(0);
    expect(byStatus.scheduled).toBe(0);
  });

  it("monthly trail queries bucket by month and zero-fill empty ones", async () => {
    // Order and length must survive: a sparkline reading one point short
    // silently shifts every value along its x-axis. 2031-04 and 2031-05 are
    // untouched by the fixture, so they must come back as explicit zeros
    // rather than being dropped from the grouped result.
    const months = ["2031-03-01", "2031-04-01", "2031-05-01"];

    const revenue = await getVerifiedRevenueByMonth(months);
    expect(revenue).toHaveLength(3);
    expect(revenue[0]).toBeCloseTo(1150, 2);
    expect(revenue[1]).toBeCloseTo(0, 2);
    expect(revenue[2]).toBeCloseTo(0, 2);

    const certs = await getCertificatesIssuedByMonth(months);
    expect(certs).toEqual([1, 0, 0]);
  });

  it("listRequestYears includes the seeded year", async () => {
    const years = new Set((await listRequestYears()).map((d) => d.getUTCFullYear()));
    expect(years.has(2031)).toBe(true);
  });
});
