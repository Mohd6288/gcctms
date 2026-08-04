"use server";

import { getContext } from "@/modules/platform/auth/service";
import { SetAttendanceInput, SetExamResultInput } from "./schema";
import { setAttendance, setExamResult, submitResults } from "./service";

async function requireContext() {
  const context = await getContext();
  if (!context) throw new Error("Not authorized");
  return context;
}

export async function setAttendanceAction(input: SetAttendanceInput) {
  const context = await requireContext();
  return setAttendance(context, SetAttendanceInput.parse(input));
}

export async function setExamResultAction(input: SetExamResultInput) {
  const context = await requireContext();
  return setExamResult(context, SetExamResultInput.parse(input));
}

export async function submitResultsAction(classId: number) {
  const context = await requireContext();
  return submitResults(context, classId);
}
