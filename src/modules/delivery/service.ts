// delivery module — business logic (Server Actions call into here, never touch db/ directly for RLS-scoped ops).
import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { attendance, classEnrollments, classes, courses, examResults, requestItems, trainingRequests } from "@/db/schema";
import { evaluateClassEligibility } from "@/modules/certification/service";
import { authorize, type AuthContext } from "@/modules/platform/auth/shared";
import { writeAudit } from "@/modules/platform/audit/service";
import { notifyPlatformAdmins } from "@/modules/platform/notifications/service";
import type { SetAttendanceInput, SetExamResultInput } from "./schema";

// One session per calendar day in [startDate, endDate] — matches the
// validated prototype's getDefaultAttendance(durationDays) model (a
// contiguous multi-day course, not a separately-scheduled session list).
export function getSessionDates(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  let cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + 86_400_000);
  }
  return dates;
}

async function getOwnedClassOrThrow(context: AuthContext, classId: number) {
  const [cls] = await db.select().from(classes).where(eq(classes.id, classId));
  if (!cls) throw new Error("Class not found.");
  if (context.role === "trainer" && cls.trainerId !== context.trainerId) throw new Error("Not authorized");
  return cls;
}

// Site policy: mark present=false for a session attended without required
// safety attire — non-compliant attendance counts as absence toward the
// 10% cap, it does not get a separate status (see 0012_delivery.sql).
export async function setAttendance(context: AuthContext, input: SetAttendanceInput) {
  if (!authorize("record_attendance", context)) throw new Error("Not authorized");
  const cls = await getOwnedClassOrThrow(context, input.classId);
  if (cls.status !== "in_progress") throw new Error(`Can't record attendance for a class that's ${cls.status}.`);

  await db
    .insert(attendance)
    .values({ classId: input.classId, sessionDate: input.sessionDate, employeeId: input.employeeId, present: input.present, recordedBy: context.userId })
    .onConflictDoUpdate({
      target: [attendance.classId, attendance.sessionDate, attendance.employeeId],
      set: { present: input.present, recordedBy: context.userId, recordedAt: new Date() },
    });
}

export async function setExamResult(context: AuthContext, input: SetExamResultInput) {
  if (!authorize("record_results", context)) throw new Error("Not authorized");
  const cls = await getOwnedClassOrThrow(context, input.classId);
  if (cls.status !== "in_progress") throw new Error(`Can't record results for a class that's ${cls.status}.`);

  const [course] = await db.select({ examId: courses.examId }).from(courses).where(eq(courses.id, cls.courseId));
  if (!course?.examId) throw new Error("This course has no exam configured.");

  const [enrollment] = await db
    .select({ id: classEnrollments.id })
    .from(classEnrollments)
    .where(and(eq(classEnrollments.classId, input.classId), eq(classEnrollments.employeeId, input.employeeId)));
  if (!enrollment) throw new Error("Employee is not enrolled in this class.");

  const [latest] = await db.select({ attemptNo: examResults.attemptNo }).from(examResults).where(eq(examResults.enrollmentId, enrollment.id)).orderBy(desc(examResults.attemptNo)).limit(1);
  const attemptNo = (latest?.attemptNo ?? 0) + 1;

  await db.insert(examResults).values({ enrollmentId: enrollment.id, examId: course.examId, score: input.score, result: input.result, attemptNo, recordedBy: context.userId });
  await writeAudit({ userId: context.userId, entityType: "exam_result", entityId: enrollment.id, action: "record", note: `${input.result} (attempt ${attemptNo})` });
}

// A request's employees can span multiple classes — completed is derived
// (roles-and-workflows.md), true only once every billable request item's
// class has itself reached completed.
async function maybeMarkRequestCompleted(requestId: number) {
  const [request] = await db.select({ status: trainingRequests.status }).from(trainingRequests).where(eq(trainingRequests.id, requestId));
  if (!request || request.status !== "scheduled") return;

  const items = await db.select({ id: requestItems.id, decision: requestItems.decision }).from(requestItems).where(eq(requestItems.requestId, requestId));
  const billableIds = items.filter((i) => i.decision !== "rejected").map((i) => i.id);
  if (billableIds.length === 0) return;

  const enrollments = await db
    .select({ requestItemId: classEnrollments.requestItemId, classId: classEnrollments.classId })
    .from(classEnrollments)
    .where(inArray(classEnrollments.requestItemId, billableIds));

  const classIds = [...new Set(enrollments.map((e) => e.classId))];
  const classRows = classIds.length > 0 ? await db.select({ id: classes.id, status: classes.status }).from(classes).where(inArray(classes.id, classIds)) : [];
  const completedClassIds = new Set(classRows.filter((c) => c.status === "completed").map((c) => c.id));
  const doneRequestItemIds = new Set(enrollments.filter((e) => completedClassIds.has(e.classId)).map((e) => e.requestItemId));

  if (billableIds.every((id) => doneRequestItemIds.has(id))) {
    await db.update(trainingRequests).set({ status: "completed" }).where(eq(trainingRequests.id, requestId));
    await writeAudit({ userId: null, entityType: "training_request", entityId: requestId, action: "auto_mark_completed", fromStatus: "scheduled", toStatus: "completed" });
  }
}

// Class close-out: snapshots attendance_pct per enrollment (attended_complete
// status), marks the class completed, and derives request completion for
// every affected request. Attendance/exam-result data is read directly by
// Phase 8's eligibility gate when it's built — no separate event bus in
// this codebase, every module just queries state (see requests/scheduling
// services for the same pattern).
export async function submitResults(context: AuthContext, classId: number) {
  if (!authorize("record_results", context)) throw new Error("Not authorized");
  const cls = await getOwnedClassOrThrow(context, classId);
  if (cls.status !== "in_progress") throw new Error(`Can't submit results for a class that's ${cls.status}.`);

  const enrollments = await db.select().from(classEnrollments).where(and(eq(classEnrollments.classId, classId), eq(classEnrollments.status, "enrolled")));
  const totalSessions = getSessionDates(cls.startDate, cls.endDate).length;

  for (const enrollment of enrollments) {
    const rows = await db.select({ present: attendance.present }).from(attendance).where(and(eq(attendance.classId, classId), eq(attendance.employeeId, enrollment.employeeId)));
    const presentCount = rows.filter((r) => r.present).length;
    const attendancePct = totalSessions > 0 ? (presentCount / totalSessions) * 100 : 100;
    await db
      .update(classEnrollments)
      .set({ status: "attended_complete", attendancePct: attendancePct.toFixed(2) })
      .where(eq(classEnrollments.id, enrollment.id));
  }

  await db.update(classes).set({ status: "completed" }).where(eq(classes.id, classId));
  await writeAudit({ userId: context.userId, entityType: "class", entityId: classId, action: "submit_results", fromStatus: "in_progress", toStatus: "completed" });

  const requestIds = [
    ...new Set(
      (await db.select({ requestId: requestItems.requestId }).from(requestItems).where(inArray(requestItems.id, enrollments.map((e) => e.requestItemId)))).map((i) => i.requestId)
    ),
  ];
  for (const requestId of requestIds) {
    await maybeMarkRequestCompleted(requestId);
  }

  // Phase 8's eligibility gate — evaluated now that every enrollment's real
  // attendance_pct/exam result exist, not via any event bus (this codebase
  // doesn't have one; every module just queries state directly).
  await evaluateClassEligibility(classId);

  await notifyPlatformAdmins("class.results_submitted", { classId, processed: enrollments.length });
  return { processed: enrollments.length };
}
