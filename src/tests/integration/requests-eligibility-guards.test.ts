import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import {
  certificates,
  classes,
  companies,
  courseJobRoles,
  coursePrerequisites,
  courses,
  documents,
  employees,
  jobRoles,
  requestItems,
  trainers,
  trainingRequests,
} from "../../db/schema";
import { encryptNationalId, hashNationalId } from "../../modules/platform/security/national-id";
import type { AuthContext } from "../../modules/platform/auth/shared";
import { createDraftRequest, submitRequest, syncRequestItems } from "../../modules/requests/service";

// Phase 4 (deliberate strengthening over the validated prototype, per
// roles-and-workflows.md): job-role eligibility and course prerequisites are
// real, blocking submission guards here — the prototype only ever shows
// these as non-blocking warning badges in its wizard.
describe("submitRequest — job-role eligibility and prerequisite guards, real DB", () => {
  const suffix = randomUUID().slice(0, 8);
  const ownerId = randomUUID();
  const trainerUserId = randomUUID();
  let companyId: number;
  let eligibleRoleId: number;
  let ineligibleRoleId: number;
  let prerequisiteCourseAId: number;
  let prerequisiteCourseBId: number;
  let gatedCourseId: number;
  let trainerId: number;
  let classId: number;

  let eligibleNoCertEmployeeId: number;
  let ineligibleRoleEmployeeId: number;
  let validPrereqAEmployeeId: number;
  let validPrereqBEmployeeId: number;
  let expiredPrereqEmployeeId: number;

  let contractorCtx: AuthContext;

  function iqama(n: number) {
    return `23111${String(n).padStart(5, "0")}`;
  }

  async function makeEmployee(name: string, jobRoleId: number, seq: number) {
    const [employee] = await db
      .insert(employees)
      .values({
        companyId,
        fullNameEn: name,
        fullNameAr: name,
        nationalIdEnc: encryptNationalId(iqama(seq)),
        nationalIdHash: hashNationalId(iqama(seq)),
        jobRoleId,
      })
      .returning({ id: employees.id });
    await db.insert(documents).values({
      companyId,
      employeeId: employee.id,
      type: "national_id",
      bucket: "documents",
      objectKey: randomUUID(),
      originalName: "id.pdf",
      mimeType: "application/pdf",
      sizeBytes: 10,
      checksumSha256: "0".repeat(64),
      uploadedBy: ownerId,
    });
    return employee.id;
  }

  async function issueCertificate(employeeId: number, courseId: number, expiresInDays: number, status: "issued" | "pending_approval" = "issued") {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    await db.insert(certificates).values({
      employeeId,
      courseId,
      classId,
      companyId,
      serial: `TEST-${randomUUID().slice(0, 8)}`,
      status,
      eligibility: {},
      issuedAt: new Date(),
      expiresAt,
    });
  }

  beforeAll(async () => {
    process.env.NATIONAL_ID_HASH_KEY ??= "test-only-key-do-not-use-in-real-envs";

    await db.execute(sql`insert into auth.users (id) values (${ownerId}), (${trainerUserId})`);

    const [company] = await db
      .insert(companies)
      .values({
        name: "Eligibility Guard Test Contractor",
        crNumber: `CR-ELIG-${suffix}`,
        contactName: "Contact",
        contactEmail: `elig-${suffix}@example.com`,
        contactPhone: "0500000001",
        ownerUserId: ownerId,
      })
      .returning({ id: companies.id });
    companyId = company.id;

    const [eligibleRole] = await db.insert(jobRoles).values({ code: `ELIG-ROLE-${suffix}`, nameEn: "Eligible Role", nameAr: "دور مؤهل" }).returning({ id: jobRoles.id });
    eligibleRoleId = eligibleRole.id;
    const [ineligibleRole] = await db.insert(jobRoles).values({ code: `INELIG-ROLE-${suffix}`, nameEn: "Ineligible Role", nameAr: "دور غير مؤهل" }).returning({ id: jobRoles.id });
    ineligibleRoleId = ineligibleRole.id;

    const [prereqA] = await db.insert(courses).values({ code: `PREREQ-A-${suffix}`, titleEn: "Prerequisite A", titleAr: "متطلب أ", durationHours: "8" }).returning({ id: courses.id });
    prerequisiteCourseAId = prereqA.id;
    const [prereqB] = await db.insert(courses).values({ code: `PREREQ-B-${suffix}`, titleEn: "Prerequisite B", titleAr: "متطلب ب", durationHours: "8" }).returning({ id: courses.id });
    prerequisiteCourseBId = prereqB.id;

    const [gatedCourse] = await db
      .insert(courses)
      .values({ code: `GATED-${suffix}`, titleEn: "Gated Course", titleAr: "دورة مقيدة", durationHours: "8" })
      .returning({ id: courses.id });
    gatedCourseId = gatedCourse.id;

    await db.insert(courseJobRoles).values({ courseId: gatedCourseId, jobRoleId: eligibleRoleId });
    // OR-semantics: EITHER prerequisite A or B satisfies the gate.
    await db.insert(coursePrerequisites).values([
      { courseId: gatedCourseId, prerequisiteCourseId: prerequisiteCourseAId },
      { courseId: gatedCourseId, prerequisiteCourseId: prerequisiteCourseBId },
    ]);

    const [trainer] = await db.insert(trainers).values({ userId: trainerUserId, fullName: "Test Trainer" }).returning({ id: trainers.id });
    trainerId = trainer.id;
    const [cls] = await db
      .insert(classes)
      .values({
        courseId: gatedCourseId,
        trainerId,
        region: "Central",
        type: "public",
        startDate: "2020-01-01",
        endDate: "2020-01-02",
        capacity: 20,
      })
      .returning({ id: classes.id });
    classId = cls.id;

    eligibleNoCertEmployeeId = await makeEmployee("Eligible No Cert", eligibleRoleId, 1);
    ineligibleRoleEmployeeId = await makeEmployee("Ineligible Role", ineligibleRoleId, 2);
    validPrereqAEmployeeId = await makeEmployee("Valid Prereq A", eligibleRoleId, 3);
    validPrereqBEmployeeId = await makeEmployee("Valid Prereq B", eligibleRoleId, 4);
    expiredPrereqEmployeeId = await makeEmployee("Expired Prereq", eligibleRoleId, 5);

    await issueCertificate(validPrereqAEmployeeId, prerequisiteCourseAId, 365);
    await issueCertificate(validPrereqBEmployeeId, prerequisiteCourseBId, 365); // satisfies via the OTHER prerequisite
    await issueCertificate(expiredPrereqEmployeeId, prerequisiteCourseAId, -1); // expired — should NOT satisfy

    contractorCtx = { userId: ownerId, role: "contractor_manager", companyId, trainerId: null, aal: "aal2" };
  });

  afterAll(async () => {
    await db.delete(requestItems).where(sql`request_id in (select id from ${trainingRequests} where company_id = ${companyId})`);
    await db.delete(trainingRequests).where(eq(trainingRequests.companyId, companyId));
    await db.delete(certificates).where(eq(certificates.companyId, companyId));
    await db.delete(classes).where(eq(classes.id, classId));
    await db.delete(trainers).where(eq(trainers.id, trainerId));
    await db.delete(documents).where(eq(documents.companyId, companyId));
    await db.delete(employees).where(eq(employees.companyId, companyId));
    await db.delete(coursePrerequisites).where(eq(coursePrerequisites.courseId, gatedCourseId));
    await db.delete(courseJobRoles).where(eq(courseJobRoles.courseId, gatedCourseId));
    await db.delete(courses).where(sql`id in (${gatedCourseId}, ${prerequisiteCourseAId}, ${prerequisiteCourseBId})`);
    await db.delete(jobRoles).where(sql`id in (${eligibleRoleId}, ${ineligibleRoleId})`);
    await db.delete(companies).where(eq(companies.id, companyId));
    await db.execute(sql`delete from auth.users where id in (${ownerId}, ${trainerUserId})`);
  });

  it("rejects submission when an employee's job role isn't eligible for the course", async () => {
    const draft = await createDraftRequest(contractorCtx, { courseId: gatedCourseId });
    await syncRequestItems(contractorCtx, { requestId: draft.id, employeeIds: [ineligibleRoleEmployeeId] });
    await expect(submitRequest(contractorCtx, draft.id)).rejects.toThrow(
      "All employees must hold a job role eligible for this course before submitting."
    );
  });

  it("rejects submission when an employee holds no valid prerequisite certificate", async () => {
    const draft = await createDraftRequest(contractorCtx, { courseId: gatedCourseId });
    await syncRequestItems(contractorCtx, { requestId: draft.id, employeeIds: [eligibleNoCertEmployeeId] });
    await expect(submitRequest(contractorCtx, draft.id)).rejects.toThrow(
      "All employees must satisfy this course's prerequisites before submitting."
    );
  });

  it("rejects submission when the employee's only prerequisite certificate is expired", async () => {
    const draft = await createDraftRequest(contractorCtx, { courseId: gatedCourseId });
    await syncRequestItems(contractorCtx, { requestId: draft.id, employeeIds: [expiredPrereqEmployeeId] });
    await expect(submitRequest(contractorCtx, draft.id)).rejects.toThrow(
      "All employees must satisfy this course's prerequisites before submitting."
    );
  });

  it("allows submission when the employee satisfies prerequisite A (OR-semantics)", async () => {
    const draft = await createDraftRequest(contractorCtx, { courseId: gatedCourseId });
    await syncRequestItems(contractorCtx, { requestId: draft.id, employeeIds: [validPrereqAEmployeeId] });
    const result = await submitRequest(contractorCtx, draft.id);
    expect(result.status).toBe("submitted");
  });

  it("allows submission when the employee satisfies prerequisite B instead — either one is sufficient", async () => {
    const draft = await createDraftRequest(contractorCtx, { courseId: gatedCourseId });
    await syncRequestItems(contractorCtx, { requestId: draft.id, employeeIds: [validPrereqBEmployeeId] });
    const result = await submitRequest(contractorCtx, draft.id);
    expect(result.status).toBe("submitted");
  });
});
