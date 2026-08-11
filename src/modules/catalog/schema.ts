import { z } from "zod";
import { REGIONS } from "@/lib/regions";

const CONTRACTOR_CATEGORIES = ["Distribution", "Transmission"] as const;

// contractorCategory: unset = universal course (shown to every company);
// set = only shown to companies with that exact category — see
// requests/queries.ts's listActiveCourses().
const CourseFields = z.object({
  code: z.string().min(1),
  titleEn: z.string().min(1),
  titleAr: z.string().min(1),
  description: z.string().optional(),
  durationHours: z.number().positive(),
  minAttendancePct: z.number().int().min(1).max(100).default(90),
  // The course says whether it is examined and at what mark (0035). A pass
  // mark without exam_required, or the reverse, is rejected by the DB check
  // constraint too.
  examRequired: z.boolean().default(false),
  passMark: z.number().int().min(0).max(100).optional(),
  validityMonths: z.number().int().positive().optional(),
  contractorCategory: z.enum(CONTRACTOR_CATEGORIES).optional(),
  // 0038 — a 'test' is assessed but not taught, and a 'card' outcome means an
  // external manufacturer issues the credential. Defaults keep every existing
  // caller producing exactly what it produced before.
});

// `outcome` and `rubric` (0038) are deliberately absent from this form. The
// four card-awarding courses are configured by migration, and a rubric is a
// scoring sheet, not something to type into a course dialog. When a second
// program needs one, that is the moment to build an editor for it — not now,
// on the strength of one.
export const CreateCourseInput = CourseFields;
export type CreateCourseInput = z.infer<typeof CreateCourseInput>;

export const UpdateCourseInput = CourseFields.extend({
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

// The cable-accessory manufacturer (0038): confirms the test date, supplies
// the evaluator, prints the cards. contactEmail is optional here because a
// manufacturer can be recorded before anyone knows who receives the pass
// list — dispatch is where its absence becomes a refusal.
export const CreateManufacturerInput = z.object({
  name: z.string().min(1),
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional(),
  phone: z.string().optional(),
});
export type CreateManufacturerInput = z.infer<typeof CreateManufacturerInput>;

export const UpdateManufacturerInput = CreateManufacturerInput.extend({
  manufacturerId: z.number().int().positive(),
  active: z.boolean(),
});
export type UpdateManufacturerInput = z.infer<typeof UpdateManufacturerInput>;

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
  // Free text: certificates a trainer holds ("NEBOSH IGC"), for a human to
  // read. Distinct from courseIds below, which is what the scheduling board
  // actually enforces — the two used to be conflated in one text box.
  qualifications: z.string().optional(),
  courseIds: z.array(z.coerce.number().int().positive()).optional(),
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
  // Omitted (undefined) leaves competencies untouched; an empty array
  // clears them. A form that never shows the picker must not wipe the
  // seeded roster just by saving a name change.
  courseIds: z.array(z.coerce.number().int().positive()).optional(),
});
export type UpdateTrainerInput = z.infer<typeof UpdateTrainerInput>;
