// assessment module — Zod validation for recording a practical assessment.
import { z } from "zod";

export const RecordAssessmentInput = z.object({
  classId: z.number().int().positive(),
  employeeId: z.number().int().positive(),
  // One entry per cell of the scoring sheet. Bounds are checked against each
  // criterion's own max in scoreRubric — this only rejects what could not be a
  // mark at all.
  marks: z
    .array(
      z.object({
        partCode: z.string().min(1),
        criterionCode: z.string().min(1),
        score: z.number().int().min(0).max(1000),
      })
    )
    .min(1),
  // Who signed the paper form. The scan is uploaded separately as a document;
  // this is the name that appears on it, so the record says who assessed even
  // before the scan arrives.
  evaluatorName: z.string().min(1).max(200),
});
export type RecordAssessmentInput = z.infer<typeof RecordAssessmentInput>;
