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
  trainers,
  trainingCenters,
  trainingRequests,
} from "../../db/schema";
import { encryptNationalId, hashNationalId } from "../../modules/platform/security/national-id";
import { getPlatformOverviewStats } from "../../modules/catalog/queries";

// Phase 4.5 acceptance criteria: "platform overview dashboard numbers are
// correct against a seeded fixture spanning multiple companies/regions."
// Compares before/after deltas rather than absolute counts, so this stays
// correct regardless of what other tests or manual testing left behind.
describe("getPlatformOverviewStats — seeded multi-company/region fixture", () => {
  const suffix = randomUUID().slice(0, 8);
  const ownerAId = randomUUID();
  const ownerBId = randomUUID();
  const trainerUserId = randomUUID();
  let companyAId: number;
  let companyBId: number;
  let jobRoleId: number;
  let employeeAId: number;
  let employeeA2Id: number;
  let employeeBId: number;
  let courseId: number;
  let trainerId: number;
  let centerId: number;
  let classWestId: number;
  let classSouthId: number;
  let certificateId: number;
  let requestAId: number;
  let requestBId: number;
  let verifiedPaymentId: number;
  let unverifiedPaymentId: number;
  let baseline: Awaited<ReturnType<typeof getPlatformOverviewStats>>;

  beforeAll(async () => {
    process.env.NATIONAL_ID_HASH_KEY ??= "test-only-key-do-not-use-in-real-envs";

    baseline = await getPlatformOverviewStats();

    await db.execute(sql`insert into auth.users (id) values (${ownerAId}), (${ownerBId}), (${trainerUserId})`);

    const [companyA] = await db
      .insert(companies)
      .values({
        name: "Overview Test Contractor A (West)",
        crNumber: `CR-OVW-A-${suffix}`,
        contactName: "A Contact",
        contactEmail: `ovw-a-${suffix}@example.com`,
        contactPhone: "0500000001",
        ownerUserId: ownerAId,
      })
      .returning({ id: companies.id });
    companyAId = companyA.id;

    const [companyB] = await db
      .insert(companies)
      .values({
        name: "Overview Test Contractor B (South)",
        crNumber: `CR-OVW-B-${suffix}`,
        contactName: "B Contact",
        contactEmail: `ovw-b-${suffix}@example.com`,
        contactPhone: "0500000002",
        ownerUserId: ownerBId,
      })
      .returning({ id: companies.id });
    companyBId = companyB.id;

    const [jobRole] = await db
      .insert(jobRoles)
      .values({ code: `OVW-ROLE-${suffix}`, nameEn: "Test Role", nameAr: "دور تجريبي" })
      .returning({ id: jobRoles.id });
    jobRoleId = jobRole.id;

    const employeeRows = await db
      .insert(employees)
      .values([
        { companyId: companyAId, fullNameEn: "A1", fullNameAr: "أ1", nationalIdEnc: encryptNationalId("2377700001"), nationalIdHash: hashNationalId("2377700001"), jobRoleId },
        { companyId: companyAId, fullNameEn: "A2", fullNameAr: "أ2", nationalIdEnc: encryptNationalId("2377700002"), nationalIdHash: hashNationalId("2377700002"), jobRoleId },
        { companyId: companyBId, fullNameEn: "B1", fullNameAr: "ب1", nationalIdEnc: encryptNationalId("2377700003"), nationalIdHash: hashNationalId("2377700003"), jobRoleId },
      ])
      .returning({ id: employees.id });
    [employeeAId, employeeA2Id, employeeBId] = employeeRows.map((r) => r.id);

    const [course] = await db
      .insert(courses)
      .values({ code: `OVW-CSCC-${suffix}`, titleEn: "Overview Course", titleAr: "دورة", durationHours: "8" })
      .returning({ id: courses.id });
    courseId = course.id;

    const [trainer] = await db.insert(trainers).values({ userId: trainerUserId, fullName: "Overview Trainer" }).returning({ id: trainers.id });
    trainerId = trainer.id;

    const [center] = await db.insert(trainingCenters).values({ name: "Overview Center" }).returning({ id: trainingCenters.id });
    centerId = center.id;

    // Two regions, only one class "in_progress" (the only status the
    // dashboard counts as "active").
    const [classWest] = await db
      .insert(classes)
      .values({
        courseId,
        trainerId,
        centerId,
        region: "West",
        type: "public",
        startDate: "2026-01-01",
        endDate: "2026-01-02",
        capacity: 20,
        status: "in_progress",
      })
      .returning({ id: classes.id });
    classWestId = classWest.id;

    const [classSouth] = await db
      .insert(classes)
      .values({
        courseId,
        trainerId,
        centerId,
        region: "South",
        type: "public",
        startDate: "2026-02-01",
        endDate: "2026-02-02",
        capacity: 20,
        status: "scheduled", // not "active" — must NOT be counted
      })
      .returning({ id: classes.id });
    classSouthId = classSouth.id;

    const [certificate] = await db
      .insert(certificates)
      .values({
        employeeId: employeeAId,
        courseId,
        classId: classWestId,
        companyId: companyAId,
        status: "issued",
        eligibility: {},
      })
      .returning({ id: certificates.id });
    certificateId = certificate.id;

    const [requestA] = await db.insert(trainingRequests).values({ companyId: companyAId, requestedBy: ownerAId, courseId }).returning({ id: trainingRequests.id });
    requestAId = requestA.id;
    const [requestB] = await db.insert(trainingRequests).values({ companyId: companyBId, requestedBy: ownerBId, courseId }).returning({ id: trainingRequests.id });
    requestBId = requestB.id;

    const [verifiedPayment] = await db
      .insert(payments)
      .values({ requestId: requestAId, description: "Verified invoice", qty: 2, unitPrice: "500.00", status: "verified" })
      .returning({ id: payments.id });
    verifiedPaymentId = verifiedPayment.id;

    const [unverifiedPayment] = await db
      .insert(payments)
      .values({ requestId: requestBId, description: "Unverified invoice", qty: 1, unitPrice: "300.00", status: "uploaded" })
      .returning({ id: payments.id });
    unverifiedPaymentId = unverifiedPayment.id;
  });

  afterAll(async () => {
    await db.delete(payments).where(eq(payments.id, verifiedPaymentId));
    await db.delete(payments).where(eq(payments.id, unverifiedPaymentId));
    await db.delete(certificates).where(eq(certificates.id, certificateId));
    await db.delete(trainingRequests).where(eq(trainingRequests.id, requestAId));
    await db.delete(trainingRequests).where(eq(trainingRequests.id, requestBId));
    await db.delete(classes).where(eq(classes.id, classWestId));
    await db.delete(classes).where(eq(classes.id, classSouthId));
    await db.delete(trainingCenters).where(eq(trainingCenters.id, centerId));
    await db.delete(trainers).where(eq(trainers.id, trainerId));
    await db.delete(courses).where(eq(courses.id, courseId));
    await db.delete(employees).where(sql`id in (${employeeAId}, ${employeeA2Id}, ${employeeBId})`);
    await db.delete(jobRoles).where(eq(jobRoles.id, jobRoleId));
    await db.delete(companies).where(sql`id in (${companyAId}, ${companyBId})`);
    await db.execute(sql`delete from auth.users where id in (${ownerAId}, ${ownerBId}, ${trainerUserId})`);
  });

  it("reflects exactly the seeded deltas: +2 companies, +3 employees, +1 active class, +1 issued certificate, +1150 revenue", async () => {
    const stats = await getPlatformOverviewStats();

    expect(stats.companies - baseline.companies).toBe(2);
    expect(stats.employees - baseline.employees).toBe(3);
    // classSouth is "scheduled", not "in_progress" — must NOT count, proving
    // the query filters by status rather than counting every class.
    expect(stats.activeClasses - baseline.activeClasses).toBe(1);
    expect(stats.certificatesIssued - baseline.certificatesIssued).toBe(1);
    // Only the verified payment counts: 2 * 500.00 * 1.15 VAT = 1150.00.
    // The unverified 300.00 payment must NOT contribute.
    expect(Number(stats.revenue) - Number(baseline.revenue)).toBeCloseTo(1150, 2);
  });
});
