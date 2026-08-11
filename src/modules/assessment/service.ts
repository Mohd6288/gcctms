// assessment module — recording a practical, rubric-scored assessment.
//
// The counterpart to delivery's setExamResult, which handles a single written
// mark. Both write the same exam_results row, so everything downstream — the
// certificate gate's examOk in particular — is untouched by which door the
// result came through.
import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { assessmentScores, classEnrollments, classes, courses, examResults } from "@/db/schema";
import { authorize, type AuthContext } from "@/modules/platform/auth/shared";
import { writeAudit } from "@/modules/platform/audit/service";
import { GuardError } from "@/modules/platform/guard-error";
import { listPriorAttempts } from "./queries";
import { scoreRubric } from "./score";
import type { RecordAssessmentInput } from "./schema";

export async function recordAssessment(context: AuthContext, input: RecordAssessmentInput) {
  if (!authorize("record_results", context)) throw new Error("Not authorized");

  const [cls] = await db.select().from(classes).where(eq(classes.id, input.classId));
  if (!cls) throw new GuardError("That class no longer exists.");
  if (cls.status !== "in_progress") {
    throw new GuardError(`Results can only be recorded while a class is running — this one is ${cls.status}.`);
  }

  const [course] = await db
    .select({ rubric: courses.rubric, passMark: courses.passMark, titleEn: courses.titleEn })
    .from(courses)
    .where(eq(courses.id, cls.courseId));

  // The other half of the pair of doors. setExamResult refuses a course that
  // HAS a rubric; this refuses one that has none — so neither path can score a
  // sitting by a rule that does not apply to it.
  if (!course?.rubric) {
    throw new GuardError(
      `${course?.titleEn ?? "This course"} has no evaluation form configured, so its marks cannot be recorded yet. Ask GCC Lab to supply the scoring sheet.`
    );
  }
  if (course.passMark == null) {
    throw new GuardError("This course has no pass mark, so a rubric cannot be scored against it.");
  }

  const [enrollment] = await db
    .select({ id: classEnrollments.id })
    .from(classEnrollments)
    .where(and(eq(classEnrollments.classId, input.classId), eq(classEnrollments.employeeId, input.employeeId)));
  if (!enrollment) throw new GuardError("That technician is not enrolled in this class.");

  const outcome = scoreRubric(course.rubric, course.passMark, input.marks);

  // A half-marked or impossibly-marked sheet has no verdict, and storing one
  // would record a result nobody assessed. The message names what is wrong so
  // the evaluator can fix it rather than guess.
  if (outcome.result === "incomplete") {
    if (outcome.invalid.length > 0) {
      const bad = outcome.invalid[0];
      throw new GuardError(
        `${bad.criterionCode} was marked ${bad.score}, but it is out of ${bad.max}. Correct the mark before saving.`
      );
    }
    throw new GuardError(
      `${outcome.missing.length} mark(s) are still blank. Every criterion must be scored before the sheet can be saved.`
    );
  }

  // "Test / Re-Test" on the evaluation form, and جديد / إعادة on the card
  // receipt. Derived across every class, not just this one: a technician who
  // failed in August and re-sits in October does so in a different class, and
  // counting only this enrolment would call that a first attempt.
  const priorAttempts = await listPriorAttempts(input.employeeId, cls.courseId, input.classId);

  const [latest] = await db
    .select({ attemptNo: examResults.attemptNo })
    .from(examResults)
    .where(eq(examResults.enrollmentId, enrollment.id))
    .orderBy(desc(examResults.attemptNo))
    .limit(1);
  const attemptNo = (latest?.attemptNo ?? 0) + 1;
  const isRetest = priorAttempts.length > 0 || attemptNo > 1;

  // Sequential, not Promise.all — concurrent Drizzle calls stall against the
  // pooler (see catalog/queries.ts's getPlatformOverviewStats).
  for (const mark of input.marks) {
    await db.insert(assessmentScores).values({
      enrollmentId: enrollment.id,
      attemptNo,
      partCode: mark.partCode,
      criterionCode: mark.criterionCode,
      score: mark.score,
      recordedBy: context.userId,
    });
  }

  // The derived row. score is the percentage rather than the raw total, so a
  // rubric result reads the same way as a written exam's wherever the two are
  // shown together — and the raw cells remain in assessment_scores.
  await db.insert(examResults).values({
    enrollmentId: enrollment.id,
    score: Math.round(outcome.percent),
    result: outcome.result,
    attemptNo,
    recordedBy: context.userId,
  });

  await writeAudit({
    userId: context.userId,
    entityType: "class",
    entityId: input.classId,
    action: "record_assessment",
    note: `${input.evaluatorName} — ${isRetest ? "re-test" : "first attempt"} — ${outcome.result} (${outcome.total}/${outcome.max})${
      outcome.failures.length > 0 ? `, below threshold: ${outcome.failures.map((f) => f.criterionCode).join(", ")}` : ""
    }`,
  });

  return {
    result: outcome.result,
    total: outcome.total,
    max: outcome.max,
    attemptNo,
    // Failing is not final: the technician re-sits, and passing then earns the
    // card exactly as a first-time pass does. What changes is only that the
    // sheet and the receipt say so.
    isRetest,
    failures: outcome.failures,
  };
}
