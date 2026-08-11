// assessment module — read-only history behind the "Test / Re-Test" box.
import "server-only";
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { assessmentScores, classEnrollments, classes, examResults } from "@/db/schema";

export interface PriorAttempt {
  classId: number;
  testDate: string;
  result: string;
  score: number;
  attemptNo: number;
}

/**
 * Every attempt this technician has made at this course, newest first —
 * across classes, not just the one in front of the evaluator.
 *
 * The Cable Technician Evaluation has a "Test / Re-Test" box and the card
 * receipt form records حالة المختبر (جديد / إعادة) per person, so somebody has
 * to know. It is derived rather than stored: a re-test is not a property
 * anyone sets, it is simply what a second sitting is, and a stored flag would
 * be one more thing to get wrong.
 *
 * Deliberately not scoped to a single enrolment. A technician who fails in
 * August and re-sits in October does so in a different class entirely, and
 * counting only the current enrolment would call that a first attempt.
 */
export async function listPriorAttempts(
  employeeId: number,
  courseId: number,
  excludeClassId?: number
): Promise<PriorAttempt[]> {
  const rows = await db
    .select({
      classId: classes.id,
      testDate: classes.endDate,
      result: examResults.result,
      score: examResults.score,
      attemptNo: examResults.attemptNo,
      recordedAt: examResults.recordedAt,
    })
    .from(examResults)
    .innerJoin(classEnrollments, eq(classEnrollments.id, examResults.enrollmentId))
    .innerJoin(classes, eq(classes.id, classEnrollments.classId))
    .where(
      and(
        eq(classEnrollments.employeeId, employeeId),
        eq(classes.courseId, courseId),
        excludeClassId == null ? undefined : ne(classes.id, excludeClassId)
      )
    )
    // id as a tie-break: two attempts can share a millisecond, and an
    // ordering that flips between reads makes "the latest attempt" a lie.
    .orderBy(desc(examResults.recordedAt), desc(examResults.id));

  return rows.map(({ recordedAt: _recordedAt, ...attempt }) => attempt);
}

/** The marked sheet for one attempt, for showing an evaluator what was scored before. */
export async function getAttemptSheet(enrollmentId: number, attemptNo: number) {
  return db
    .select({
      partCode: assessmentScores.partCode,
      criterionCode: assessmentScores.criterionCode,
      score: assessmentScores.score,
    })
    .from(assessmentScores)
    .where(and(eq(assessmentScores.enrollmentId, enrollmentId), eq(assessmentScores.attemptNo, attemptNo)));
}
