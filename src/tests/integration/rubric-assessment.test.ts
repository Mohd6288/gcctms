import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import {
  assessmentScores,
  certificates,
  classEnrollments,
  classes,
  companies,
  courses,
  documents,
  employees,
  examResults,
  jobRoles,
  payments,
  profiles,
  qualificationCards,
  requestItems,
  trainers,
  trainingRequests,
} from "../../db/schema";
import { recordAssessment } from "../../modules/assessment/service";
import { evaluateClassEligibility } from "../../modules/certification/service";
import { setExamResult } from "../../modules/delivery/service";
import { GuardError } from "../../modules/platform/guard-error";
import { encryptNationalId, hashNationalId } from "../../modules/platform/security/national-id";
import { grantPriorCertificate } from "../helpers/ohs-induction";
import type { AuthContext } from "../../modules/platform/auth/shared";

// Two doors, each admitting only what it can score correctly.
//
// Before this, setExamResult would take a single mark for a cable test and
// derive pass/fail by total — so 18/16/19/17/10 filed as a pass at 80%, when
// the evaluation form makes it a fail on the insulation criterion. Both the
// refusal and the correct path are asserted here against the real database,
// because the rule only matters where it is actually enforced.
describe("recording a rubric-scored assessment", () => {
  const suffix = randomUUID().slice(0, 8);
  const adminId = randomUUID();
  const adminCtx: AuthContext = { userId: adminId, role: "platform_admin", companyId: null, trainerId: null, region: null, aal: "aal2" };

  let companyId: number;
  let cableClassId: number;
  let writtenClassId: number;
  let technicianId: number;
  const requestIdByClass = new Map<number, number>();

  async function seedClass(courseCode: string) {
    const [course] = await db.select({ id: courses.id }).from(courses).where(eq(courses.code, courseCode));
    const [trainer] = await db
      .insert(trainers)
      .values({ fullName: `Evaluator ${suffix}-${courseCode}`, email: `ev-${suffix}-${courseCode}@example.test` })
      .returning({ id: trainers.id });
    const [cls] = await db
      .insert(classes)
      .values({
        courseId: course.id,
        trainerId: trainer.id,
        region: "Central",
        type: "public",
        startDate: "2026-08-01",
        endDate: "2026-08-01",
        sessions: [],
        capacity: 10,
        status: "in_progress",
      })
      .returning({ id: classes.id });

    const [request] = await db
      .insert(trainingRequests)
      .values({ companyId, requestedBy: adminId, courseId: course.id, status: "scheduled" })
      .returning({ id: trainingRequests.id });
    const [item] = await db
      .insert(requestItems)
      .values({ requestId: request.id, employeeId: technicianId, courseId: course.id })
      .returning({ id: requestItems.id });
    await db.insert(classEnrollments).values({
      classId: cls.id,
      requestItemId: item.id,
      employeeId: technicianId,
      companyId,
      status: "enrolled",
    });
    requestIdByClass.set(cls.id, request.id);
    return cls.id;
  }

  beforeAll(async () => {
    await db.execute(sql`insert into auth.users (id, email) values (${adminId}, ${`rubric-${suffix}@example.test`})`);
    await db.insert(profiles).values({ userId: adminId, role: "platform_admin", fullName: "Rubric Admin" });

    const [company] = await db
      .insert(companies)
      .values({
        name: `Rubric Co ${suffix}`,
        crNumber: `CR-RB-${suffix}`,
        contactName: "Contact",
        contactEmail: `rb-${suffix}@example.test`,
        contactPhone: "0500000002",
        contractorCategory: "Distribution",
        ownerUserId: adminId,
      })
      .returning({ id: companies.id });
    companyId = company.id;

    const [role] = await db.select({ id: jobRoles.id }).from(jobRoles).where(eq(jobRoles.code, "D07"));
    const nid = `2${Math.floor(Math.random() * 1e9)}`.padEnd(10, "0");
    const [employee] = await db
      .insert(employees)
      .values({
        companyId,
        fullNameEn: "Rubric Technician",
        fullNameAr: "فني",
        nationalIdEnc: encryptNationalId(nid),
        nationalIdHash: hashNationalId(nid),
        jobRoleId: role.id,
        status: "active",
      })
      .returning({ id: employees.id });
    technicianId = employee.id;

    // CTCT10's four entry certificates. Without them the prerequisite gate
    // refuses — correctly — and no card would be earned to test.
    for (const code of ["CSCC02", "CSCC21", "CSCC22", "CSCC00"]) {
      await grantPriorCertificate(companyId, technicianId, code, adminId);
    }

    cableClassId = await seedClass("CTCT10"); // rubric-scored
    writtenClassId = await seedClass("CSCC14"); // an ordinary written course
  });

  afterAll(async () => {
    const enrolments = await db
      .select({ id: classEnrollments.id })
      .from(classEnrollments)
      .where(eq(classEnrollments.companyId, companyId));
    for (const e of enrolments) {
      await db.delete(assessmentScores).where(eq(assessmentScores.enrollmentId, e.id));
      await db.delete(examResults).where(eq(examResults.enrollmentId, e.id));
    }
    for (const requestId of requestIdByClass.values()) {
      await db.delete(payments).where(eq(payments.requestId, requestId));
    }
    await db.delete(qualificationCards).where(eq(qualificationCards.companyId, companyId));
    await db.delete(certificates).where(eq(certificates.companyId, companyId));
    await db.delete(classEnrollments).where(eq(classEnrollments.companyId, companyId));
    await db.delete(requestItems).where(eq(requestItems.employeeId, technicianId));
    await db.delete(trainingRequests).where(eq(trainingRequests.companyId, companyId));
    for (const id of [cableClassId, writtenClassId]) {
      if (id) await db.delete(classes).where(eq(classes.id, id));
    }
    await db.delete(documents).where(eq(documents.companyId, companyId));
    await db.delete(employees).where(eq(employees.companyId, companyId));
    await db.delete(companies).where(eq(companies.id, companyId));
    await db.delete(profiles).where(eq(profiles.userId, adminId));
    await db.execute(sql`delete from auth.users where id = ${adminId}`);
  });

  const cableMarks = (...scores: number[]) =>
    ["safety", "preparation", "assembly", "skills", "insulation"].map((criterionCode, i) => ({
      partCode: "joint",
      criterionCode,
      score: scores[i],
    }));

  it("refuses a single mark for a test scored on an evaluation form", async () => {
    // The hazard this closes: 80 of 100 filed as a pass.
    await expect(
      setExamResult(adminCtx, { classId: cableClassId, employeeId: technicianId, score: 80 })
    ).rejects.toBeInstanceOf(GuardError);

    const rows = await db
      .select({ id: examResults.id })
      .from(examResults)
      .innerJoin(classEnrollments, eq(classEnrollments.id, examResults.enrollmentId))
      .where(eq(classEnrollments.classId, cableClassId));
    expect(rows, "nothing was written").toHaveLength(0);
  });

  it("refuses a rubric sheet for a course that has no evaluation form", async () => {
    await expect(
      recordAssessment(adminCtx, {
        classId: writtenClassId,
        employeeId: technicianId,
        marks: cableMarks(20, 20, 20, 20, 20),
        evaluatorName: "Someone",
      })
    ).rejects.toBeInstanceOf(GuardError);
  });

  it("refuses a half-marked sheet rather than recording a failure nobody assessed", async () => {
    await expect(
      recordAssessment(adminCtx, {
        classId: cableClassId,
        employeeId: technicianId,
        marks: cableMarks(20, 20, 20, 20).slice(0, 4),
        evaluatorName: "Abdullah Bukuwaimel",
      })
    ).rejects.toThrow(/blank/i);
  });

  it("records a fail on the per-item rule, and stores every cell", async () => {
    const outcome = await recordAssessment(adminCtx, {
      classId: cableClassId,
      employeeId: technicianId,
      marks: cableMarks(18, 16, 19, 17, 10),
      evaluatorName: "Abdullah Bukuwaimel",
    });

    expect(outcome.result).toBe("fail");
    expect(outcome.total).toBe(80);
    expect(outcome.failures.map((f) => f.criterionCode)).toEqual(["insulation"]);

    const [enrolment] = await db
      .select({ id: classEnrollments.id })
      .from(classEnrollments)
      .where(eq(classEnrollments.classId, cableClassId));

    // The raw sheet survives, not just the verdict — an auditor asking why a
    // technician failed needs the marking, not a word.
    const cells = await db.select().from(assessmentScores).where(eq(assessmentScores.enrollmentId, enrolment.id));
    expect(cells).toHaveLength(5);
    expect(cells.find((c) => c.criterionCode === "insulation")?.score).toBe(10);

    // And the derived row the certificate gate reads.
    const [exam] = await db.select().from(examResults).where(eq(examResults.enrollmentId, enrolment.id));
    expect(exam.result).toBe("fail");
    expect(exam.score).toBe(80);
    expect(exam.attemptNo).toBe(1);
  });

  it("records a re-test as a second attempt without disturbing the first", async () => {
    const outcome = await recordAssessment(adminCtx, {
      classId: cableClassId,
      employeeId: technicianId,
      marks: cableMarks(18, 16, 19, 17, 16),
      evaluatorName: "Abdullah Bukuwaimel",
    });

    expect(outcome.result).toBe("pass");
    expect(outcome.attemptNo).toBe(2);

    const [enrolment] = await db
      .select({ id: classEnrollments.id })
      .from(classEnrollments)
      .where(eq(classEnrollments.classId, cableClassId));
    const attempts = await db.select().from(examResults).where(eq(examResults.enrollmentId, enrolment.id));
    expect(attempts).toHaveLength(2);
    // The gate reads the latest attempt; the earlier fail stays on file.
    expect(attempts.find((a) => a.attemptNo === 1)?.result).toBe("fail");
    expect(attempts.find((a) => a.attemptNo === 2)?.result).toBe("pass");
  });

  it("awards a card and NOT a certificate once the gate passes", async () => {
    // The second hazard: evaluateClassEligibility inserted into `certificates`
    // unconditionally, never looking at what the course awards. A cable pass
    // would have produced a GCC Lab certificate for a credential GCC Lab does
    // not issue — and put it on the public verify page, which promises the
    // opposite.
    await db
      .update(classEnrollments)
      .set({ status: "attended_complete", attendancePct: "100.00" })
      .where(eq(classEnrollments.classId, cableClassId));

    // The gate needs a verified payment, and the last recorded attempt above
    // was the passing re-test.
    await db.insert(payments).values({
      requestId: requestIdByClass.get(cableClassId)!,
      description: "Cable test",
      qty: 1,
      unitPrice: "695.00",
      status: "verified",
    });

    await evaluateClassEligibility(cableClassId);

    const cards = await db.select().from(qualificationCards).where(eq(qualificationCards.classId, cableClassId));
    const certs = await db.select().from(certificates).where(eq(certificates.classId, cableClassId));

    expect(certs, "a card course must never mint a certificate").toHaveLength(0);
    expect(cards, "the card is what a passing technician earns").toHaveLength(1);
    expect(cards[0].status).toBe("awaiting_issuer");
    expect(cards[0].issuanceType).toBe("new");
    expect(cards[0].testDate).toBe("2026-08-01");
    // Expiry is set when the manufacturer reports the card issued. The
    // two-year clock runs from the test date, but the card does not exist yet.
    expect(cards[0].expiresAt).toBeNull();
    expect(cards[0].cardNumber).toBeNull();
    // The six gate inputs travel with it, so an auditor can see why it was
    // earned without recomputing them.
    expect(cards[0].eligibility).toMatchObject({ examOk: true, paymentOk: true, attendanceOk: true });
  });

  it("is idempotent — running the gate twice does not mint a second card", async () => {
    await evaluateClassEligibility(cableClassId);
    const cards = await db.select().from(qualificationCards).where(eq(qualificationCards.classId, cableClassId));
    expect(cards).toHaveLength(1);
  });
});
