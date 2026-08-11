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
import { listPriorAttempts } from "../../modules/assessment/queries";
import { recordAssessment } from "../../modules/assessment/service";
import { evaluateClassEligibility } from "../../modules/certification/service";
import { encryptNationalId, hashNationalId } from "../../modules/platform/security/national-id";
import type { AuthContext } from "../../modules/platform/auth/shared";
import { grantPriorCertificate } from "../helpers/ohs-induction";

// Failing must not be final. The evaluation form has a "Re-Test" box and the
// card receipt records حالة المختبر (جديد / إعادة), so the whole shape of the
// programme assumes a second chance — and a technician who fails in August and
// passes in October earns the card exactly as a first-time pass does.
//
// The re-sit happens in a DIFFERENT class, which is what makes this worth a
// test of its own: attempt numbering restarts per enrolment, so anything that
// counted attempts within one class would call the October sitting a first
// attempt and mark the receipt جديد.
describe("re-testing after a failure", () => {
  const suffix = randomUUID().slice(0, 8);
  const adminId = randomUUID();
  const adminCtx: AuthContext = { userId: adminId, role: "platform_admin", companyId: null, trainerId: null, region: null, aal: "aal2" };

  let companyId: number;
  let courseId: number;
  let technicianId: number;
  const classIds: number[] = [];
  const requestIds: number[] = [];

  const marks = (...scores: number[]) =>
    ["safety", "preparation", "assembly", "skills", "insulation"].map((criterionCode, i) => ({
      partCode: "joint",
      criterionCode,
      score: scores[i],
    }));

  // A whole sitting: schedule it, enrol the technician, verify the payment.
  async function holdASitting(endDate: string) {
    const [trainer] = await db
      .insert(trainers)
      .values({ fullName: `Evaluator ${suffix}-${endDate}`, email: `rt-${suffix}-${endDate}@example.test` })
      .returning({ id: trainers.id });
    const [cls] = await db
      .insert(classes)
      .values({
        courseId,
        trainerId: trainer.id,
        region: "Central",
        type: "public",
        startDate: endDate,
        endDate,
        sessions: [],
        capacity: 10,
        status: "in_progress",
      })
      .returning({ id: classes.id });

    const [request] = await db
      .insert(trainingRequests)
      .values({ companyId, requestedBy: adminId, courseId, status: "scheduled" })
      .returning({ id: trainingRequests.id });
    const [item] = await db
      .insert(requestItems)
      .values({ requestId: request.id, employeeId: technicianId, courseId })
      .returning({ id: requestItems.id });
    await db.insert(classEnrollments).values({
      classId: cls.id,
      requestItemId: item.id,
      employeeId: technicianId,
      companyId,
      status: "enrolled",
    });
    // Each sitting is its own 695 — a re-test is a fresh request and a fresh
    // invoice, not a free second go.
    await db.insert(payments).values({
      requestId: request.id,
      description: "Cable test",
      qty: 1,
      unitPrice: "695.00",
      status: "verified",
    });

    classIds.push(cls.id);
    requestIds.push(request.id);
    return cls.id;
  }

  async function closeSitting(classId: number) {
    await db
      .update(classEnrollments)
      .set({ status: "attended_complete", attendancePct: "100.00" })
      .where(eq(classEnrollments.classId, classId));
    await evaluateClassEligibility(classId);
  }

  beforeAll(async () => {
    await db.execute(sql`insert into auth.users (id, email) values (${adminId}, ${`retest-${suffix}@example.test`})`);
    await db.insert(profiles).values({ userId: adminId, role: "platform_admin", fullName: "Retest Admin" });

    const [company] = await db
      .insert(companies)
      .values({
        name: `Retest Co ${suffix}`,
        crNumber: `CR-RT-${suffix}`,
        contactName: "Contact",
        contactEmail: `rt-${suffix}@example.test`,
        contactPhone: "0500000003",
        contractorCategory: "Distribution",
        ownerUserId: adminId,
      })
      .returning({ id: companies.id });
    companyId = company.id;

    const [course] = await db.select({ id: courses.id }).from(courses).where(eq(courses.code, "CTCT10"));
    courseId = course.id;

    const [role] = await db.select({ id: jobRoles.id }).from(jobRoles).where(eq(jobRoles.code, "D07"));
    const nid = `2${Math.floor(Math.random() * 1e9)}`.padEnd(10, "0");
    const [employee] = await db
      .insert(employees)
      .values({
        companyId,
        fullNameEn: "Second Chance",
        fullNameAr: "فرصة ثانية",
        nationalIdEnc: encryptNationalId(nid),
        nationalIdHash: hashNationalId(nid),
        jobRoleId: role.id,
        status: "active",
      })
      .returning({ id: employees.id });
    technicianId = employee.id;

    for (const code of ["CSCC02", "CSCC21", "CSCC22", "CSCC00"]) {
      await grantPriorCertificate(companyId, technicianId, code, adminId);
    }
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
    await db.delete(qualificationCards).where(eq(qualificationCards.companyId, companyId));
    await db.delete(certificates).where(eq(certificates.companyId, companyId));
    await db.delete(classEnrollments).where(eq(classEnrollments.companyId, companyId));
    for (const id of requestIds) await db.delete(payments).where(eq(payments.requestId, id));
    await db.delete(requestItems).where(eq(requestItems.employeeId, technicianId));
    await db.delete(trainingRequests).where(eq(trainingRequests.companyId, companyId));
    for (const id of classIds) await db.delete(classes).where(eq(classes.id, id));
    await db.delete(documents).where(eq(documents.companyId, companyId));
    await db.delete(employees).where(eq(employees.companyId, companyId));
    await db.delete(companies).where(eq(companies.id, companyId));
    await db.delete(profiles).where(eq(profiles.userId, adminId));
    await db.execute(sql`delete from auth.users where id = ${adminId}`);
  });

  it("earns no card from a failed sitting, and does not close the door", async () => {
    const august = await holdASitting("2026-08-01");

    const first = await recordAssessment(adminCtx, {
      classId: august,
      employeeId: technicianId,
      marks: marks(18, 16, 19, 17, 10),
      evaluatorName: "Abdullah Bukuwaimel",
    });

    expect(first.result).toBe("fail");
    expect(first.isRetest, "the first sitting is not a re-test").toBe(false);

    await closeSitting(august);

    const cards = await db.select().from(qualificationCards).where(eq(qualificationCards.classId, august));
    expect(cards, "a failed sitting earns nothing").toHaveLength(0);
  });

  it("knows the October sitting is a re-test, though it is a different class", async () => {
    const october = await holdASitting("2026-10-01");

    // The trap this guards: attempt numbering restarts per enrolment, so the
    // second class's first row is attempt 1. Only history across classes can
    // tell the evaluator to tick "Re-Test".
    const prior = await listPriorAttempts(technicianId, courseId, october);
    expect(prior).toHaveLength(1);
    expect(prior[0].result).toBe("fail");

    const second = await recordAssessment(adminCtx, {
      classId: october,
      employeeId: technicianId,
      marks: marks(18, 16, 19, 17, 16),
      evaluatorName: "Abdullah Bukuwaimel",
    });

    expect(second.result).toBe("pass");
    expect(second.isRetest, "a second sitting in a new class is still a re-test").toBe(true);
    expect(second.attemptNo, "numbering is per enrolment").toBe(1);
  });

  it("awards the card on the re-test, exactly as a first-time pass would", async () => {
    const october = classIds[classIds.length - 1];
    await closeSitting(october);

    const cards = await db.select().from(qualificationCards).where(eq(qualificationCards.classId, october));
    expect(cards).toHaveLength(1);
    expect(cards[0].status).toBe("awaiting_issuer");
    expect(cards[0].testDate).toBe("2026-10-01");

    // And still nothing from the August failure — one card, from the sitting
    // that was actually passed.
    const all = await db.select().from(qualificationCards).where(eq(qualificationCards.companyId, companyId));
    expect(all).toHaveLength(1);
  });

  it("keeps the failed attempt on file", async () => {
    // An auditor asking why a technician holds a card dated October needs to
    // see the August failure, not a tidied-up history.
    const attempts = await listPriorAttempts(technicianId, courseId);
    expect(attempts).toHaveLength(2);
    expect(attempts.map((a) => a.result).sort()).toEqual(["fail", "pass"]);
  });
});
