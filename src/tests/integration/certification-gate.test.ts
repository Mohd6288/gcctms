import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import {
  certificates,
  classEnrollments,
  classes,
  companies,
  courseJobRoles,
  coursePrerequisites,
  courses,
  employees,
  examResults,
  exams,
  jobRoles,
  payments,
  requestItems,
  trainers,
  trainingRequests,
} from "../../db/schema";
import { encryptNationalId, hashNationalId } from "../../modules/platform/security/national-id";
import type { AuthContext } from "../../modules/platform/auth/shared";
import { approveCertificate, evaluateClassEligibility, revokeCertificate } from "../../modules/certification/service";
import { getIssuedCertificateBySerial } from "../../modules/certification/queries";

// Phase 8 — real DB. The eligibility gate's 6 conditions and the resulting
// serial/expiry/PDF-upload are all things a mock can't meaningfully stand
// in for; this also exercises the real local Supabase Storage "certificates"
// bucket (not just Postgres).
describe("certification — eligibility gate, approval, revocation, real DB", () => {
  const suffix = randomUUID().slice(0, 8);
  const ownerId = randomUUID();
  const adminId = randomUUID();
  const trainerUserId = randomUUID();
  let companyId: number;
  let eligibleRoleId: number;
  let ineligibleRoleId: number;
  let prerequisiteCourseId: number;
  let gatedCourseId: number;
  let trainerId: number;
  let classId: number;
  let prereqClassId: number;
  let examId: number;

  let adminCtx: AuthContext;

  function iqama(n: number) {
    return `23444${String(n).padStart(5, "0")}`;
  }

  async function makeCase(opts: {
    seq: number;
    jobRoleId: number;
    employeeStatus?: "active" | "inactive";
    attendancePct: string;
    examResult: "pass" | "fail" | null;
    paymentStatus: "uploaded" | "verified";
    withPrerequisite: boolean;
  }) {
    const [employee] = await db
      .insert(employees)
      .values({
        companyId,
        fullNameEn: `Gate Case ${opts.seq}`,
        fullNameAr: `حالة ${opts.seq}`,
        nationalIdEnc: encryptNationalId(iqama(opts.seq)),
        nationalIdHash: hashNationalId(iqama(opts.seq)),
        jobRoleId: opts.jobRoleId,
        status: opts.employeeStatus ?? "active",
      })
      .returning({ id: employees.id });

    if (opts.withPrerequisite) {
      // Shared across every case needing one — a fresh per-case class for
      // the same trainer/date would trip the real trainer_no_overlap
      // exclusion constraint (correctly; that's Phase 6 working as
      // designed, not something to work around per-case).
      await db.insert(certificates).values({
        employeeId: employee.id,
        courseId: prerequisiteCourseId,
        classId: prereqClassId,
        companyId,
        serial: `PREREQ-${randomUUID().slice(0, 8)}`,
        status: "issued",
        eligibility: {},
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 365 * 86_400_000),
      });
    }

    const [request] = await db.insert(trainingRequests).values({ companyId, requestedBy: ownerId, courseId: gatedCourseId, status: "scheduled", preferredRegion: "Central" }).returning({ id: trainingRequests.id });
    const [item] = await db.insert(requestItems).values({ requestId: request.id, employeeId: employee.id, courseId: gatedCourseId, decision: "approved" }).returning({ id: requestItems.id });
    await db.insert(payments).values({ requestId: request.id, description: "test", qty: 1, unitPrice: "500.00", status: opts.paymentStatus });

    const [enrollment] = await db
      .insert(classEnrollments)
      .values({ classId, requestItemId: item.id, employeeId: employee.id, companyId, status: "attended_complete", attendancePct: opts.attendancePct })
      .returning({ id: classEnrollments.id });

    if (opts.examResult) {
      await db.insert(examResults).values({ enrollmentId: enrollment.id, examId, score: opts.examResult === "pass" ? 90 : 40, result: opts.examResult, recordedBy: trainerUserId });
    }

    return { employeeId: employee.id, enrollmentId: enrollment.id };
  }

  beforeAll(async () => {
    process.env.NATIONAL_ID_HASH_KEY ??= "test-only-key-do-not-use-in-real-envs";
    await db.execute(sql`insert into auth.users (id) values (${ownerId}), (${adminId}), (${trainerUserId})`);
    await db.execute(sql`insert into profiles (user_id, role, full_name) values (${adminId}, 'platform_admin', 'Gate Admin')`);

    const [company] = await db
      .insert(companies)
      .values({ name: "Gate Test Contractor", crNumber: `CR-GATE-${suffix}`, contactName: "Contact", contactEmail: `gate-${suffix}@example.com`, contactPhone: "0500000001", ownerUserId: ownerId })
      .returning({ id: companies.id });
    companyId = company.id;

    const [eligibleRole] = await db.insert(jobRoles).values({ code: `GATE-ELIG-${suffix}`, nameEn: "Eligible", nameAr: "مؤهل" }).returning({ id: jobRoles.id });
    eligibleRoleId = eligibleRole.id;
    const [ineligibleRole] = await db.insert(jobRoles).values({ code: `GATE-INELIG-${suffix}`, nameEn: "Ineligible", nameAr: "غير مؤهل" }).returning({ id: jobRoles.id });
    ineligibleRoleId = ineligibleRole.id;

    const [exam] = await db.insert(exams).values({ code: `GATE-EXAM-${suffix}`, title: "Gate Exam", passMark: 70 }).returning({ id: exams.id });
    examId = exam.id;

    const [prereqCourse] = await db.insert(courses).values({ code: `GATE-PREREQ-${suffix}`, titleEn: "Prereq", titleAr: "متطلب", durationHours: "8" }).returning({ id: courses.id });
    prerequisiteCourseId = prereqCourse.id;

    const [gatedCourse] = await db.insert(courses).values({ code: `GATE-${suffix}`, titleEn: "Gated Course", titleAr: "دورة مقيدة", durationHours: "16", examId, minAttendancePct: 90 }).returning({ id: courses.id });
    gatedCourseId = gatedCourse.id;
    await db.insert(courseJobRoles).values({ courseId: gatedCourseId, jobRoleId: eligibleRoleId });
    await db.insert(coursePrerequisites).values({ courseId: gatedCourseId, prerequisiteCourseId });

    const [trainer] = await db.insert(trainers).values({ userId: trainerUserId, fullName: "Gate Trainer" }).returning({ id: trainers.id });
    trainerId = trainer.id;

    const [cls] = await db
      .insert(classes)
      .values({ courseId: gatedCourseId, trainerId, region: "Central", type: "public", startDate: "2030-01-01", endDate: "2030-01-02", capacity: 20, status: "completed" })
      .returning({ id: classes.id });
    classId = cls.id;

    // Non-overlapping date range from the main class above — same trainer,
    // must not conflict with classes_trainer_no_overlap.
    const [prereqClass] = await db
      .insert(classes)
      .values({ courseId: prerequisiteCourseId, trainerId, region: "Central", type: "public", startDate: "2029-01-01", endDate: "2029-01-01", capacity: 20, status: "completed" })
      .returning({ id: classes.id });
    prereqClassId = prereqClass.id;

    adminCtx = { userId: adminId, role: "platform_admin", companyId: null, trainerId: null, region: null, aal: "aal2" };
  });

  afterAll(async () => {
    await db.delete(certificates).where(eq(certificates.companyId, companyId));
    await db.delete(examResults).where(sql`enrollment_id in (select id from ${classEnrollments} where company_id = ${companyId})`);
    await db.delete(classEnrollments).where(eq(classEnrollments.companyId, companyId));
    await db.delete(payments).where(sql`request_id in (select id from ${trainingRequests} where company_id = ${companyId})`);
    await db.delete(requestItems).where(sql`request_id in (select id from ${trainingRequests} where company_id = ${companyId})`);
    await db.delete(trainingRequests).where(eq(trainingRequests.companyId, companyId));
    await db.delete(classes).where(sql`trainer_id = ${trainerId}`);
    await db.delete(trainers).where(eq(trainers.id, trainerId));
    await db.delete(employees).where(eq(employees.companyId, companyId));
    await db.delete(coursePrerequisites).where(eq(coursePrerequisites.courseId, gatedCourseId));
    await db.delete(courseJobRoles).where(eq(courseJobRoles.courseId, gatedCourseId));
    await db.delete(courses).where(sql`id in (${gatedCourseId}, ${prerequisiteCourseId})`);
    await db.delete(exams).where(eq(exams.id, examId));
    await db.delete(jobRoles).where(sql`id in (${eligibleRoleId}, ${ineligibleRoleId})`);
    await db.delete(companies).where(eq(companies.id, companyId));
    await db.execute(sql`delete from profiles where user_id = ${adminId}`);
    await db.execute(sql`delete from auth.users where id in (${ownerId}, ${adminId}, ${trainerUserId})`);
  });

  it("gate: each individual failing condition blocks certificate creation; the fully-eligible case passes", async () => {
    const baseline = await makeCase({ seq: 1, jobRoleId: eligibleRoleId, attendancePct: "100.00", examResult: "pass", paymentStatus: "verified", withPrerequisite: true });
    const lowAttendance = await makeCase({ seq: 2, jobRoleId: eligibleRoleId, attendancePct: "50.00", examResult: "pass", paymentStatus: "verified", withPrerequisite: true });
    const examFail = await makeCase({ seq: 3, jobRoleId: eligibleRoleId, attendancePct: "100.00", examResult: "fail", paymentStatus: "verified", withPrerequisite: true });
    const paymentUnverified = await makeCase({ seq: 4, jobRoleId: eligibleRoleId, attendancePct: "100.00", examResult: "pass", paymentStatus: "uploaded", withPrerequisite: true });
    const wrongJobRole = await makeCase({ seq: 5, jobRoleId: ineligibleRoleId, attendancePct: "100.00", examResult: "pass", paymentStatus: "verified", withPrerequisite: true });
    const missingPrereq = await makeCase({ seq: 6, jobRoleId: eligibleRoleId, attendancePct: "100.00", examResult: "pass", paymentStatus: "verified", withPrerequisite: false });
    const inactive = await makeCase({ seq: 7, jobRoleId: eligibleRoleId, employeeStatus: "inactive", attendancePct: "100.00", examResult: "pass", paymentStatus: "verified", withPrerequisite: true });

    const result = await evaluateClassEligibility(classId);
    expect(result.created).toBe(1);

    const allCerts = await db.select({ employeeId: certificates.employeeId, status: certificates.status }).from(certificates).where(eq(certificates.classId, classId));
    const certifiedEmployeeIds = new Set(allCerts.map((c) => c.employeeId));

    expect(certifiedEmployeeIds.has(baseline.employeeId)).toBe(true);
    expect(certifiedEmployeeIds.has(lowAttendance.employeeId)).toBe(false);
    expect(certifiedEmployeeIds.has(examFail.employeeId)).toBe(false);
    expect(certifiedEmployeeIds.has(paymentUnverified.employeeId)).toBe(false);
    expect(certifiedEmployeeIds.has(wrongJobRole.employeeId)).toBe(false);
    expect(certifiedEmployeeIds.has(missingPrereq.employeeId)).toBe(false);
    expect(certifiedEmployeeIds.has(inactive.employeeId)).toBe(false);

    const [baselineCert] = allCerts.filter((c) => c.employeeId === baseline.employeeId);
    expect(baselineCert.status).toBe("pending_approval");
  });

  it("evaluateClassEligibility is idempotent — running it again creates no duplicate", async () => {
    const before = await db.select({ id: certificates.id }).from(certificates).where(eq(certificates.classId, classId));
    const result = await evaluateClassEligibility(classId);
    expect(result.created).toBe(0);
    const after = await db.select({ id: certificates.id }).from(certificates).where(eq(certificates.classId, classId));
    expect(after.length).toBe(before.length);
  });

  it("approveCertificate issues with the correct serial format, 730-day expiry, and a real uploaded PDF", async () => {
    const [pending] = await db.select().from(certificates).where(and(eq(certificates.classId, classId), eq(certificates.status, "pending_approval")));
    expect(pending).toBeTruthy();

    const before = Date.now();
    await approveCertificate(adminCtx, pending.id);

    const [issued] = await db.select().from(certificates).where(eq(certificates.id, pending.id));
    expect(issued.status).toBe("issued");
    expect(issued.serial).toMatch(new RegExp(`^GCCLAB-GATE-${suffix}-\\d{8}-\\d{4}$`));
    expect(issued.pdfObjectKey).toBeTruthy();
    expect(issued.issuedAt).toBeTruthy();
    expect(issued.expiresAt).toBeTruthy();

    const daysValid = (new Date(issued.expiresAt!).getTime() - new Date(issued.issuedAt!).getTime()) / 86_400_000;
    expect(Math.round(daysValid)).toBe(730);
    expect(new Date(issued.approvedAt!).getTime()).toBeGreaterThanOrEqual(before);

    // Real Supabase Storage round-trip — proves a genuine PDF was uploaded,
    // not just a database row claiming one exists.
    const { createAdminClient } = await import("../../lib/supabase/admin");
    const admin = createAdminClient();
    const { data, error } = await admin.storage.from("certificates").download(issued.pdfObjectKey!);
    expect(error).toBeNull();
    expect(data).toBeTruthy();
    const bytes = Buffer.from(await data!.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(1000);
    expect(bytes.subarray(0, 4).toString()).toBe("%PDF");

    await admin.storage.from("certificates").remove([issued.pdfObjectKey!]);
  }, 30_000);

  it("public verify: returns the issued certificate, masking/expiry is the caller's job (query only gates status)", async () => {
    const [issued] = await db.select().from(certificates).where(and(eq(certificates.classId, classId), eq(certificates.status, "issued")));
    const found = await getIssuedCertificateBySerial(issued.serial!);
    expect(found).not.toBeNull();
    expect(found!.serial).toBe(issued.serial);

    const notFound = await getIssuedCertificateBySerial("GCCLAB-DOES-NOT-EXIST-0000");
    expect(notFound).toBeNull();
  });

  it("public verify: a pending_approval certificate (not yet issued) is not visible", async () => {
    const [pendingCert] = await db
      .insert(certificates)
      .values({ employeeId: (await makeCase({ seq: 8, jobRoleId: eligibleRoleId, attendancePct: "100.00", examResult: "pass", paymentStatus: "verified", withPrerequisite: true })).employeeId, courseId: gatedCourseId, classId, companyId, serial: `GCCLAB-PENDING-${suffix}`, status: "pending_approval", eligibility: {} })
      .returning({ serial: certificates.serial });
    const found = await getIssuedCertificateBySerial(pendingCert.serial!);
    expect(found).toBeNull();
  });

  it("revokeCertificate flips issued -> revoked and the verify query still surfaces it (as revoked, for the page to explain)", async () => {
    const [issued] = await db.select().from(certificates).where(and(eq(certificates.classId, classId), eq(certificates.status, "issued")));
    await revokeCertificate(adminCtx, { certificateId: issued.id, reason: "Data entry error" });

    const [after] = await db.select().from(certificates).where(eq(certificates.id, issued.id));
    expect(after.status).toBe("revoked");
    expect(after.revokedReason).toBe("Data entry error");

    const found = await getIssuedCertificateBySerial(issued.serial!);
    expect(found).not.toBeNull();
    expect(found!.status).toBe("revoked");

    await expect(revokeCertificate(adminCtx, { certificateId: issued.id, reason: "again" })).rejects.toThrow("Can't revoke a certificate that's revoked.");
  });
});
