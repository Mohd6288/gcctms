// scheduling module — Zod validation schemas for this module's mutations.
import { z } from "zod";

const REGIONS = ["North", "South", "East", "West", "Central"] as const;
const CLASS_TYPES = ["private", "public"] as const;

export const AssignRequestItemRegionInput = z.object({
  requestItemId: z.number().int().positive(),
  region: z.enum(REGIONS),
});
export type AssignRequestItemRegionInput = z.infer<typeof AssignRequestItemRegionInput>;

export const SetRegionalAdminInput = z.object({
  region: z.enum(REGIONS),
  adminUserId: z.string().uuid(),
});
export type SetRegionalAdminInput = z.infer<typeof SetRegionalAdminInput>;

// course and region are set once at creation and never change — see
// UpdateClassInput below, which structurally excludes both.
export const CreateClassInput = z.object({
  courseId: z.number().int().positive(),
  trainerId: z.number().int().positive(),
  centerId: z.number().int().positive().optional(),
  region: z.enum(REGIONS),
  type: z.enum(CLASS_TYPES),
  companyId: z.number().int().positive().optional(),
  startDate: z.string().date(),
  endDate: z.string().date(),
  capacity: z.number().int().positive(),
});
export type CreateClassInput = z.infer<typeof CreateClassInput>;

export const UpdateClassInput = z.object({
  classId: z.number().int().positive(),
  trainerId: z.number().int().positive(),
  centerId: z.number().int().positive().optional(),
  startDate: z.string().date(),
  endDate: z.string().date(),
  capacity: z.number().int().positive(),
});
export type UpdateClassInput = z.infer<typeof UpdateClassInput>;

export const CancelClassInput = z.object({
  classId: z.number().int().positive(),
  reason: z.string().min(1),
});
export type CancelClassInput = z.infer<typeof CancelClassInput>;

export const EnrollRequestItemInput = z.object({
  requestItemId: z.number().int().positive(),
  classId: z.number().int().positive(),
});
export type EnrollRequestItemInput = z.infer<typeof EnrollRequestItemInput>;
