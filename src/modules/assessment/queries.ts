// assessment module — read-only history behind the "Test / Re-Test" box.
import "server-only";
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { assessmentScores, classEnrollments, classes, employees, examResults } from "@/db/schema";

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
    // Ordering by a column the select does not return is fine — and better
    // than selecting it only to drop it on the way out.
    .orderBy(desc(examResults.recordedAt), desc(examResults.id));

  return rows;
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

export interface AssessmentCandidate {
  employeeId: number;
  enrollmentId: number;
  fullNameEn: string;
  latestResult: string | null;
  latestScore: number | null;
  latestAttemptNo: number | null;
  /** Prior sittings of this course in OTHER classes — the "Re-Test" box. */
  priorAttempts: number;
}

/**
 * Everything the rubric screen needs for one class, in one place.
 *
 * The marks themselves are not returned: an evaluator transcribes a signed
 * paper form, so the screen starts empty every time rather than pre-filling
 * from a previous attempt — pre-filled numbers are the ones that get saved
 * unread.
 */
export async function listAssessmentCandidates(classId: number): Promise<AssessmentCandidate[]> {
  const [cls] = await db.select({ courseId: classes.courseId }).from(classes).where(eq(classes.id, classId));
  if (!cls) return [];

  const enrolled = await db
    .select({
      employeeId: classEnrollments.employeeId,
      enrollmentId: classEnrollments.id,
      fullNameEn: employees.fullNameEn,
    })
    .from(classEnrollments)
    .innerJoin(employees, eq(employees.id, classEnrollments.employeeId))
    .where(eq(classEnrollments.classId, classId))
    .orderBy(employees.fullNameEn);

  // Sequential, not Promise.all — concurrent Drizzle calls stall against the
  // pooler (see catalog/queries.ts's getPlatformOverviewStats).
  const candidates: AssessmentCandidate[] = [];
  for (const row of enrolled) {
    const [latest] = await db
      .select({ result: examResults.result, score: examResults.score, attemptNo: examResults.attemptNo })
      .from(examResults)
      .where(eq(examResults.enrollmentId, row.enrollmentId))
      .orderBy(desc(examResults.attemptNo))
      .limit(1);
    const prior = await listPriorAttempts(row.employeeId, cls.courseId, classId);
    candidates.push({
      ...row,
      latestResult: latest?.result ?? null,
      latestScore: latest?.score ?? null,
      latestAttemptNo: latest?.attemptNo ?? null,
      priorAttempts: prior.length,
    });
  }
  return candidates;
}
