import type { Rubric } from "@/db/schema";

/**
 * Scoring a practical assessment — the Cable Technician Evaluation and every
 * rubric that follows it.
 *
 * Pure and database-free on purpose. It runs twice for every sitting: once in
 * the browser on each keystroke, so the evaluator's transcription shows its
 * verdict as it is typed, and once on the server when the marks are saved. The
 * two must agree, which they cannot if the rule lives in a screen.
 */

export interface RubricMark {
  partCode: string;
  criterionCode: string;
  score: number;
}

export interface FailedCriterion {
  partCode: string;
  criterionCode: string;
  score: number;
  /** The lowest mark that would have passed this criterion. */
  required: number;
  max: number;
}

export interface RubricOutcome {
  /** `incomplete` whenever the sitting cannot yet be judged — see `missing` and `invalid`. */
  result: "pass" | "fail" | "incomplete";
  total: number;
  max: number;
  percent: number;
  /** Criteria scored below the threshold. Empty on a pass. */
  failures: FailedCriterion[];
  missing: { partCode: string; criterionCode: string }[];
  invalid: { partCode: string; criterionCode: string; score: number; max: number }[];
}

/** The lowest mark that passes a criterion — 14 of 20 at a 70% threshold. */
export function requiredMark(max: number, passMark: number): number {
  return Math.ceil((max * passMark) / 100);
}

export function scoreRubric(rubric: Rubric, passMark: number, marks: RubricMark[]): RubricOutcome {
  const byCell = new Map(marks.map((m) => [`${m.partCode}/${m.criterionCode}`, m.score]));

  const missing: RubricOutcome["missing"] = [];
  const invalid: RubricOutcome["invalid"] = [];
  const failures: FailedCriterion[] = [];
  let total = 0;
  let max = 0;

  for (const part of rubric.parts) {
    for (const criterion of rubric.criteria) {
      max += criterion.max;
      const score = byCell.get(`${part.code}/${criterion.code}`);

      if (score == null || Number.isNaN(score)) {
        missing.push({ partCode: part.code, criterionCode: criterion.code });
        continue;
      }

      // Never clamped. A 25 typed into a box worth 20 is a transcription
      // error, and silently recording 20 would file a mark the evaluator
      // never gave — on the document that decides whether someone may work
      // on a live cable.
      if (score < 0 || score > criterion.max) {
        invalid.push({ partCode: part.code, criterionCode: criterion.code, score, max: criterion.max });
        continue;
      }

      total += score;

      // Integer arithmetic rather than score / max >= passMark / 100, which
      // turns an exact boundary into a floating-point coin toss: 14 out of 20
      // at 70% must pass, always.
      if (score * 100 < criterion.max * passMark) {
        failures.push({
          partCode: part.code,
          criterionCode: criterion.code,
          score,
          required: requiredMark(criterion.max, passMark),
          max: criterion.max,
        });
      }
    }
  }

  const percent = max > 0 ? (total / max) * 100 : 0;

  // A sitting that is not fully and validly marked has no verdict. Treating a
  // half-filled sheet as a fail would record a failure nobody assessed.
  if (missing.length > 0 || invalid.length > 0) {
    return { result: "incomplete", total, max, percent, failures, missing, invalid };
  }

  // per_item is the rule the evaluation form states: "a score of 70% or above
  // in EACH evaluation item". 18/16/19/17/10 is 80 of 100 and a fail, because
  // a technician who cannot pass an insulation test must not hold the card
  // however well they did elsewhere.
  const passed =
    rubric.passRule === "per_item" ? failures.length === 0 : total * 100 >= max * passMark;

  return { result: passed ? "pass" : "fail", total, max, percent, failures, missing, invalid };
}
