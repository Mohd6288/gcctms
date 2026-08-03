import { z } from "zod";

const REGIONS = ["North", "South", "East", "West", "Central"] as const;
const TRAINING_TYPES = ["on_site", "training_center", "virtual_theory_onsite_practical"] as const;

export const DraftRequestFields = z.object({
  courseId: z.number().int().positive(),
  preferredRegion: z.enum(REGIONS).optional(),
  preferredCity: z.string().optional(),
  preferredTrainingType: z.enum(TRAINING_TYPES).optional(),
  // Structured, but strictly non-binding — see database-schema.md.
  preferredStartDate: z.string().date().optional(),
  preferredEndDate: z.string().date().optional(),
  notes: z.string().optional(),
});
export type DraftRequestFields = z.infer<typeof DraftRequestFields>;

export const CreateDraftRequestInput = DraftRequestFields;
export type CreateDraftRequestInput = z.infer<typeof CreateDraftRequestInput>;

export const UpdateDraftRequestInput = DraftRequestFields.extend({
  requestId: z.number().int().positive(),
});
export type UpdateDraftRequestInput = z.infer<typeof UpdateDraftRequestInput>;

export const SyncRequestItemsInput = z.object({
  requestId: z.number().int().positive(),
  employeeIds: z.array(z.number().int().positive()),
});
export type SyncRequestItemsInput = z.infer<typeof SyncRequestItemsInput>;

export const SetEmployeeDecisionInput = z.object({
  requestItemId: z.number().int().positive(),
  decision: z.enum(["approved", "rejected"]),
  decisionReason: z.string().optional(),
});
export type SetEmployeeDecisionInput = z.infer<typeof SetEmployeeDecisionInput>;

export const VerifyRequestDocumentInput = z.object({
  requestId: z.number().int().positive(),
  type: z.enum(["registration_sheet", "hrbl_request_form"]),
});
export type VerifyRequestDocumentInput = z.infer<typeof VerifyRequestDocumentInput>;

export const RequestMoreInfoInput = z.object({
  requestId: z.number().int().positive(),
  message: z.string().min(1),
});
export type RequestMoreInfoInput = z.infer<typeof RequestMoreInfoInput>;

export const RejectRequestInput = z.object({
  requestId: z.number().int().positive(),
  reason: z.string().min(1),
});
export type RejectRequestInput = z.infer<typeof RejectRequestInput>;
