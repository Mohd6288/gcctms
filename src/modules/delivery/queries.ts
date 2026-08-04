// delivery module — read-side queries (Drizzle, RLS-scoped via lib/supabase/server.ts).
import "server-only";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { attendance, classEnrollments, examResults } from "@/db/schema";

export async function listAttendanceForClass(classId: number) {
  return db
    .select({ employeeId: attendance.employeeId, sessionDate: attendance.sessionDate, present: attendance.present })
    .from(attendance)
    .where(eq(attendance.classId, classId));
}

// Latest attempt per enrollment only — the UI shows current standing, not
// full retake history.
export async function listLatestExamResultsForClass(classId: number) {
  const enrollments = await db.select({ id: classEnrollments.id, employeeId: classEnrollments.employeeId }).from(classEnrollments).where(eq(classEnrollments.classId, classId));
  if (enrollments.length === 0) return [];

  const rows = await db
    .select({ enrollmentId: examResults.enrollmentId, score: examResults.score, result: examResults.result, attemptNo: examResults.attemptNo })
    .from(examResults)
    .where(inArray(examResults.enrollmentId, enrollments.map((e) => e.id)))
    .orderBy(desc(examResults.attemptNo));

  const latestByEnrollment = new Map<number, (typeof rows)[number]>();
  for (const row of rows) {
    if (!latestByEnrollment.has(row.enrollmentId)) latestByEnrollment.set(row.enrollmentId, row);
  }

  const employeeByEnrollment = new Map(enrollments.map((e) => [e.id, e.employeeId]));
  return Array.from(latestByEnrollment.values()).map((r) => ({
    employeeId: employeeByEnrollment.get(r.enrollmentId)!,
    score: r.score,
    result: r.result,
    attemptNo: r.attemptNo,
  }));
}
