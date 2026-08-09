import { z } from "zod";
import { REGIONS } from "@/lib/regions";

const CONTRACTOR_CATEGORIES = ["Distribution", "Transmission"] as const;

// contractorCategory: unset = universal course (shown to every company);
// set = only shown to companies with that exact category — see
// requests/queries.ts's listActiveCourses().
export const CreateCourseInput = z.object({
  code: z.string().min(1),
  titleEn: z.string().min(1),
  titleAr: z.string().min(1),
  description: z.string().optional(),
  durationHours: z.number().positive(),
  minAttendancePct: z.number().int().min(1).max(100).default(90),
  examId: z.number().int().positive().optional(),
  validityMonths: z.number().int().positive().optional(),
  contractorCategory: z.enum(CONTRACTOR_CATEGORIES).optional(),
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

export const SetCoursePrerequisitesInput = z.object({
  courseId: z.number().int().positive(),
  prerequisiteCourseIds: z.array(z.number().int().positive()),
});
export type SetCoursePrerequisitesInput = z.infer<typeof SetCoursePrerequisitesInput>;

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

// name is the primary key and the FK target from training_requests, so it
// is not editable after creation — renaming would cascade through history.
export const CreateCityInput = z.object({
  name: z.string().trim().min(1).max(60),
  nameAr: z.string().trim().min(1).max(60),
  region: z.enum(REGIONS),
});
export type CreateCityInput = z.infer<typeof CreateCityInput>;

export const SetCityActiveInput = z.object({
  name: z.string().trim().min(1),
  active: z.boolean(),
});
export type SetCityActiveInput = z.infer<typeof SetCityActiveInput>;

export const CreateTrainerInput = z.object({
  email: z.string().email(),
  fullName: z.string().min(1),
  qualifications: z.string().optional(),
});
export type CreateTrainerInput = z.infer<typeof CreateTrainerInput>;

export const CreateTrainerLoginInput = z.object({
  trainerId: z.coerce.number().int().positive(),
});
export type CreateTrainerLoginInput = z.infer<typeof CreateTrainerLoginInput>;

export const UpdateTrainerInput = z.object({
  trainerId: z.number().int().positive(),
  fullName: z.string().min(1),
  qualifications: z.string().optional(),
  active: z.boolean(),
});
export type UpdateTrainerInput = z.infer<typeof UpdateTrainerInput>;
