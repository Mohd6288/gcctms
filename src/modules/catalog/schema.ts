import { z } from "zod";

const REGIONS = ["North", "South", "East", "West", "Central"] as const;

export const CreateCourseInput = z.object({
  code: z.string().min(1),
  titleEn: z.string().min(1),
  titleAr: z.string().min(1),
  description: z.string().optional(),
  durationHours: z.number().positive(),
  minAttendancePct: z.number().int().min(1).max(100).default(90),
  examId: z.number().int().positive().optional(),
  validityMonths: z.number().int().positive().optional(),
});
export type CreateCourseInput = z.infer<typeof CreateCourseInput>;

export const UpdateCourseInput = CreateCourseInput.extend({
  courseId: z.number().int().positive(),
  active: z.boolean(),
});
export type UpdateCourseInput = z.infer<typeof UpdateCourseInput>;

export const SetCourseJobRolesInput = z.object({
  courseId: z.number().int().positive(),
  jobRoleIds: z.array(z.number().int().positive()),
});
export type SetCourseJobRolesInput = z.infer<typeof SetCourseJobRolesInput>;

export const CreateExamInput = z.object({
  code: z.string().min(1),
  title: z.string().min(1),
  passMark: z.number().int().min(0).max(100),
});
export type CreateExamInput = z.infer<typeof CreateExamInput>;

export const UpdateExamInput = CreateExamInput.extend({
  examId: z.number().int().positive(),
  active: z.boolean(),
});
export type UpdateExamInput = z.infer<typeof UpdateExamInput>;

export const CreateTrainingCenterInput = z.object({
  name: z.string().min(1),
  city: z.string().optional(),
  address: z.string().optional(),
  capacity: z.number().int().positive().optional(),
});
export type CreateTrainingCenterInput = z.infer<typeof CreateTrainingCenterInput>;

export const UpdateTrainingCenterInput = CreateTrainingCenterInput.extend({
  centerId: z.number().int().positive(),
  active: z.boolean(),
});
export type UpdateTrainingCenterInput = z.infer<typeof UpdateTrainingCenterInput>;

export const CreatePricingInput = z.object({
  courseId: z.number().int().positive(),
  region: z.enum(REGIONS).optional(),
  price: z.number().positive(),
  effectiveFrom: z.string().date(),
  effectiveTo: z.string().date().optional(),
});
export type CreatePricingInput = z.infer<typeof CreatePricingInput>;

export const CreateTrainerInput = z.object({
  email: z.string().email(),
  fullName: z.string().min(1),
  qualifications: z.string().optional(),
});
export type CreateTrainerInput = z.infer<typeof CreateTrainerInput>;

export const UpdateTrainerInput = z.object({
  trainerId: z.number().int().positive(),
  fullName: z.string().min(1),
  qualifications: z.string().optional(),
  active: z.boolean(),
});
export type UpdateTrainerInput = z.infer<typeof UpdateTrainerInput>;
