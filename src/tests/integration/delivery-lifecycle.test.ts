import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import {
  attendance,
  classEnrollments,
  classes,
  companies,
  courses,
  employees,
  examResults,
  exams,
  jobRoles,
  requestItems,
  trainers,
  trainingRequests,
} from "../../db/schema";
import { encryptNationalId, hashNationalId } from "../../modules/platform/security/national-id";
import type { AuthContext } from "../../modules/platform/auth/shared";
import { getSessionDates, setAttendance, setExamResult, submitResults } from "../../modules/delivery/service";

// Phase 7 — real DB. The exact attendance_pct math and the derived
// scheduled -> completed transition both depend on real aggregation, not
// something a mock can meaningfully stand in for.
describe("delivery — attendance, exam results, class close-out, real DB", () => {
  const suffix = randomUUID().slice(0, 8);
  const ownerId = randomUUID();
  const trainerUserId = randomUUID();
  const otherTrainerUserId = randomUUID();
  let companyId: number;
  let jobRoleId: number;
  let examId: number;
  let courseId: number;
  let courseNoExamId: number;
  let trainerId: number;
  let otherTrainerId: number;

  let trainerCtx: AuthContext;
  let otherTrainerCtx: AuthContext;

  async function makeEnrolledEmployee(seq: number, cls: { id: number; courseId: number }) {
    const [employee] = await db
      .insert(employees)
      .values({
        companyId,
        fullNameEn: `Delivery Employee ${seq}`,
        fullNameAr: `موظف ${seq}`,
        nationalIdEnc: encryptNationalId(`2333${String(seq).padStart(6, "0")}`),
        nationalIdHash: hashNationalId(`2333${String(seq).padStart(6, "0")}`),
        jobRoleId,
      })
      .returning({ id: employees.id });

    const [request] = await db
      .insert(trainingRequests)
      .values({ companyId, requestedBy: ownerId, courseId: cls.courseId, status: "scheduled", preferredRegion: "Central" })
      .returning({ id: trainingRequests.id });

    const [item] = await db.insert(requestItems).values({ requestId: request.id, employeeId: employee.id, courseId: cls.courseId, decision: "approved" }).returning({ id: requestItems.id });

    await db.insert(classEnrollments).values({ classId: cls.id, requestItemId: item.id, employeeId: employee.id, companyId, status: "enrolled" });

    return { employeeId: employee.id, requestId: request.id, requestItemId: item.id };
  }

  beforeAll(async () => {
    await db.execute(sql`insert into auth.users (id) values (${ownerId}), (${trainerUserId}), (${otherTrainerUserId})`);

    const [company] = await db
      .insert(companies)
      .values({ name: "Delivery Test Contractor", crNumber: `CR-DEL-${suffix}`, contactName: "Contact", contactEmail: `del-${suffix}@example.com`, contactPhone: "0500000001", ownerUserId: ownerId })
      .returning({ id: companies.id });
    companyId = company.id;

    const [jobRole] = await db.insert(jobRoles).values({ code: `DEL-ROLE-${suffix}`, nameEn: "Delivery Role", nameAr: "دور" }).returning({ id: jobRoles.id });
    jobRoleId = jobRole.id;

    const [exam] = await db.insert(exams).values({ code: `DEL-EXAM-${suffix}`, title: "Delivery Test Exam", passMark: 70 }).returning({ id: exams.id });
    examId = exam.id;

    const [course] = await db.insert(courses).values({ code: `DEL-${suffix}`, titleEn: "Delivery Test Course", titleAr: "دورة", durationHours: "24", examId }).returning({ id: courses.id });
    courseId = course.id;

    const [courseNoExam] = await db.insert(courses).values({ code: `DEL-NOEXAM-${suffix}`, titleEn: "No Exam Course", titleAr: "دورة بدون اختبار", durationHours: "8" }).returning({ id: courses.id });
    courseNoExamId = courseNoExam.id;

    const [trainer] = await db.insert(trainers).values({ userId: trainerUserId, fullName: "Delivery Trainer" }).returning({ id: trainers.id });
    trainerId = trainer.id;
    const [otherTrainer] = await db.insert(trainers).values({ userId: otherTrainerUserId, fullName: "Other Trainer" }).returning({ id: trainers.id });
    otherTrainerId = otherTrainer.id;

    trainerCtx = { userId: trainerUserId, role: "trainer", companyId: null, trainerId, aal: "aal2" };
    otherTrainerCtx = { userId: otherTrainerUserId, role: "trainer", companyId: null, trainerId: otherTrainerId, aal: "aal2" };
  });

  afterAll(async () => {
    await db.delete(examResults).where(sql`enrollment_id in (select id from ${classEnrollments} where company_id = ${companyId})`);
    await db.delete(attendance).where(sql`class_id in (select id from ${classes} where trainer_id in (${trainerId}, ${otherTrainerId}))`);
    await db.delete(classEnrollments).where(eq(classEnrollments.companyId, companyId));
    await db.delete(requestItems).where(sql`request_id in (select id from ${trainingRequests} where company_id = ${companyId})`);
    await db.delete(trainingRequests).where(eq(trainingRequests.companyId, companyId));
    await db.delete(classes).where(sql`trainer_id in (${trainerId}, ${otherTrainerId})`);
    await db.delete(trainers).where(sql`id in (${trainerId}, ${otherTrainerId})`);
    await db.delete(employees).where(eq(employees.companyId, companyId));
    await db.delete(courses).where(sql`id in (${courseId}, ${courseNoExamId})`);
    await db.delete(exams).where(eq(exams.id, examId));
    await db.delete(jobRoles).where(eq(jobRoles.id, jobRoleId));
    await db.delete(companies).where(eq(companies.id, companyId));
    await db.execute(sql`delete from auth.users where id in (${ownerId}, ${trainerUserId}, ${otherTrainerUserId})`);
  });

  it("getSessionDates returns one date per day inclusive", () => {
    expect(getSessionDates("2030-07-01", "2030-07-03")).toEqual(["2030-07-01", "2030-07-02", "2030-07-03"]);
    expect(getSessionDates("2030-07-01", "2030-07-01")).toEqual(["2030-07-01"]);
  });

  it("blocks attendance/results writes from a trainer who doesn't own the class", async () => {
    const [cls] = await db
      .insert(classes)
      .values({ courseId, trainerId, region: "Central", type: "public", startDate: "2030-07-01", endDate: "2030-07-03", capacity: 10, status: "in_progress" })
      .returning({ id: classes.id });
    const a = await makeEnrolledEmployee(1, { id: cls.id, courseId });

    await expect(setAttendance(otherTrainerCtx, { classId: cls.id, employeeId: a.employeeId, sessionDate: "2030-07-01", present: true })).rejects.toThrow("Not authorized");
    await expect(setExamResult(otherTrainerCtx, { classId: cls.id, employeeId: a.employeeId, result: "pass", score: 90 })).rejects.toThrow("Not authorized");
    await expect(submitResults(otherTrainerCtx, cls.id)).rejects.toThrow("Not authorized");
  });

  it("blocks writes once the class is no longer in_progress", async () => {
    const [cls] = await db
      .insert(classes)
      .values({ courseId, trainerId, region: "Central", type: "public", startDate: "2030-08-01", endDate: "2030-08-01", capacity: 10, status: "scheduled" })
      .returning({ id: classes.id });
    const a = await makeEnrolledEmployee(2, { id: cls.id, courseId });

    await expect(setAttendance(trainerCtx, { classId: cls.id, employeeId: a.employeeId, sessionDate: "2030-08-01", present: true })).rejects.toThrow("Can't record attendance for a class that's scheduled.");
  });

  it("rejects recording an exam result for a course with no exam configured", async () => {
    const [cls] = await db
      .insert(classes)
      .values({ courseId: courseNoExamId, trainerId, region: "Central", type: "public", startDate: "2030-09-01", endDate: "2030-09-01", capacity: 10, status: "in_progress" })
      .returning({ id: classes.id });
    const a = await makeEnrolledEmployee(3, { id: cls.id, courseId: courseNoExamId });

    await expect(setExamResult(trainerCtx, { classId: cls.id, employeeId: a.employeeId, result: "pass", score: 90 })).rejects.toThrow("This course has no exam configured.");
  });

  it("retakes increment attempt_no; latest attempt is what's stored per enrollment", async () => {
    const [cls] = await db
      .insert(classes)
      .values({ courseId, trainerId, region: "East", type: "public", startDate: "2030-10-01", endDate: "2030-10-01", capacity: 10, status: "in_progress" })
      .returning({ id: classes.id });
    const a = await makeEnrolledEmployee(4, { id: cls.id, courseId });

    await setExamResult(trainerCtx, { classId: cls.id, employeeId: a.employeeId, result: "fail", score: 50 });
    await setExamResult(trainerCtx, { classId: cls.id, employeeId: a.employeeId, result: "pass", score: 80 });

    const [enrollment] = await db.select({ id: classEnrollments.id }).from(classEnrollments).where(and(eq(classEnrollments.classId, cls.id), eq(classEnrollments.employeeId, a.employeeId)));
    const results = await db.select().from(examResults).where(eq(examResults.enrollmentId, enrollment.id)).orderBy(examResults.attemptNo);
    expect(results).toHaveLength(2);
    expect(results[0].attemptNo).toBe(1);
    expect(results[1].attemptNo).toBe(2);
    expect(results[1].result).toBe("pass");
  });

  it("submitResults computes attendance_pct correctly, marks the class completed, and derives request completion", async () => {
    const [cls] = await db
      .insert(classes)
      .values({ courseId, trainerId, region: "West", type: "public", startDate: "2030-11-01", endDate: "2030-11-04", capacity: 10, status: "in_progress" })
      .returning({ id: classes.id }); // 4-day class -> 4 sessions

    const a = await makeEnrolledEmployee(5, { id: cls.id, courseId }); // present 3/4 days = 75%
    const b = await makeEnrolledEmployee(6, { id: cls.id, courseId }); // present 4/4 days = 100%

    for (const day of ["2030-11-01", "2030-11-02", "2030-11-03"]) {
      await setAttendance(trainerCtx, { classId: cls.id, employeeId: a.employeeId, sessionDate: day, present: true });
    }
    await setAttendance(trainerCtx, { classId: cls.id, employeeId: a.employeeId, sessionDate: "2030-11-04", present: false });
    for (const day of ["2030-11-01", "2030-11-02", "2030-11-03", "2030-11-04"]) {
      await setAttendance(trainerCtx, { classId: cls.id, employeeId: b.employeeId, sessionDate: day, present: true });
    }

    const result = await submitResults(trainerCtx, cls.id);
    expect(result.processed).toBe(2);

    const [clsAfter] = await db.select({ status: classes.status }).from(classes).where(eq(classes.id, cls.id));
    expect(clsAfter.status).toBe("completed");

    const enrollmentsAfter = await db.select().from(classEnrollments).where(eq(classEnrollments.classId, cls.id));
    const enrollmentA = enrollmentsAfter.find((e) => e.employeeId === a.employeeId)!;
    const enrollmentB = enrollmentsAfter.find((e) => e.employeeId === b.employeeId)!;
    expect(enrollmentA.status).toBe("attended_complete");
    expect(enrollmentA.attendancePct).toBe("75.00");
    expect(enrollmentB.attendancePct).toBe("100.00");

    // Single-employee-per-request fixtures -> each request is fully done as
    // soon as its one class completes -> derived to 'completed'.
    const [requestAAfter] = await db.select({ status: trainingRequests.status }).from(trainingRequests).where(eq(trainingRequests.id, a.requestId));
    const [requestBAfter] = await db.select({ status: trainingRequests.status }).from(trainingRequests).where(eq(trainingRequests.id, b.requestId));
    expect(requestAAfter.status).toBe("completed");
    expect(requestBAfter.status).toBe("completed");
  });

  it("a request with employees split across two classes only completes once BOTH classes are done", async () => {
    const [clsX] = await db
      .insert(classes)
      .values({ courseId, trainerId, region: "South", type: "public", startDate: "2030-12-01", endDate: "2030-12-01", capacity: 10, status: "in_progress" })
      .returning({ id: classes.id });
    const [clsY] = await db
      .insert(classes)
      .values({ courseId, trainerId, region: "South", type: "public", startDate: "2030-12-05", endDate: "2030-12-05", capacity: 10, status: "in_progress" })
      .returning({ id: classes.id });

    // Two employees on the SAME request, split across the two classes.
    const [request] = await db.insert(trainingRequests).values({ companyId, requestedBy: ownerId, courseId, status: "scheduled", preferredRegion: "South" }).returning({ id: trainingRequests.id });

    const [empX] = await db
      .insert(employees)
      .values({ companyId, fullNameEn: "Split X", fullNameAr: "س", nationalIdEnc: encryptNationalId("2333900001"), nationalIdHash: hashNationalId("2333900001"), jobRoleId })
      .returning({ id: employees.id });
    const [itemX] = await db.insert(requestItems).values({ requestId: request.id, employeeId: empX.id, courseId, decision: "approved" }).returning({ id: requestItems.id });
    await db.insert(classEnrollments).values({ classId: clsX.id, requestItemId: itemX.id, employeeId: empX.id, companyId, status: "enrolled" });

    const [empY] = await db
      .insert(employees)
      .values({ companyId, fullNameEn: "Split Y", fullNameAr: "ص", nationalIdEnc: encryptNationalId("2333900002"), nationalIdHash: hashNationalId("2333900002"), jobRoleId })
      .returning({ id: employees.id });
    const [itemY] = await db.insert(requestItems).values({ requestId: request.id, employeeId: empY.id, courseId, decision: "approved" }).returning({ id: requestItems.id });
    await db.insert(classEnrollments).values({ classId: clsY.id, requestItemId: itemY.id, employeeId: empY.id, companyId, status: "enrolled" });

    await submitResults(trainerCtx, clsX.id);
    const [afterFirst] = await db.select({ status: trainingRequests.status }).from(trainingRequests).where(eq(trainingRequests.id, request.id));
    expect(afterFirst.status).toBe("scheduled"); // still waiting on clsY

    await submitResults(trainerCtx, clsY.id);
    const [afterBoth] = await db.select({ status: trainingRequests.status }).from(trainingRequests).where(eq(trainingRequests.id, request.id));
    expect(afterBoth.status).toBe("completed");
  });
});
