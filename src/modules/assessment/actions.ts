"use server";

import { getContext } from "@/modules/platform/auth/service";
import { runGuarded } from "@/modules/platform/guard-error";
import { RecordAssessmentInput } from "./schema";
import { recordAssessment } from "./service";

export async function recordAssessmentAction(input: RecordAssessmentInput) {
  const context = await getContext();
  if (!context) throw new Error("Not authorized");
  // runGuarded, because every refusal above is one the evaluator can act on —
  // a blank cell, a mark out of range — and a thrown error would reach them as
  // "Minified React error #441" instead.
  return runGuarded(() => recordAssessment(context, RecordAssessmentInput.parse(input)));
}
