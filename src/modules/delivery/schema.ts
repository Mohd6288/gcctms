// delivery module — Zod validation schemas for this module's mutations.
import { z } from "zod";

export const SetAttendanceInput = z.object({
  classId: z.number().int().positive(),
  employeeId: z.number().int().positive(),
  sessionDate: z.string().date(),
  present: z.boolean(),
});
export type SetAttendanceInput = z.infer<typeof SetAttendanceInput>;

export const SetExamResultInput = z.object({
  classId: z.number().int().positive(),
  employeeId: z.number().int().positive(),
  // No `result` field: the server derives it from the score against the
  // course's pass mark (see setExamResult).
  score: z.number().int().min(0).max(100),
});
export type SetExamResultInput = z.infer<typeof SetExamResultInput>;
