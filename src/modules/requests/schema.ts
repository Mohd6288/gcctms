import { z } from "zod";
import { REGIONS } from "@/lib/regions";

const TRAINING_TYPES = ["on_site", "training_center", "virtual_theory_onsite_practical"] as const;

/**
 * The sentinel `preferred_city` carries for معهد خارجي.
 *
 * preferred_city is a foreign key onto cities.name, so an external venue
 * cannot be stored there — and adding every contractor's own institute to the
 * cities table would corrupt the list GCC Lab schedules against. The name goes
 * in external_institute_name and this marks which of the two to read.
 */
export const EXTERNAL_INSTITUTE = "__external__";

export const DraftRequestFields = z.object({
  courseId: z.number().int().positive(),
  preferredRegion: z.enum(REGIONS).optional(),
  preferredCity: z.string().optional(),
  preferredTrainingType: z.enum(TRAINING_TYPES).optional(),
  // Structured, but strictly non-binding — see database-schema.md.
  preferredStartDate: z.string().date().optional(),
  preferredEndDate: z.string().date().optional(),
  notes: z.string().optional(),
  // نموذج طلب اختبار — نوع الطلب. Only meaningful for a course that awards a
  // card; a certificate is issued once and not renewed by re-sitting.
  issuanceType: z.enum(["new", "renewal"]).optional(),
  // معهد خارجي — a venue that is none of GCC Lab's four institutes.
  externalInstituteName: z.string().trim().max(200).optional(),
})
  // Choosing "other institute" without naming it produces a request an admin
  // cannot schedule and has to phone about. Caught here, where the contractor
  // can still fix it, rather than two days later.
  .refine((v) => !(v.preferredCity === EXTERNAL_INSTITUTE && !v.externalInstituteName), {
    message: "Name the external institute, or choose one of GCC Lab's centres.",
    path: ["externalInstituteName"],
  });
export type DraftRequestFields = z.infer<typeof DraftRequestFields>;

export const CreateDraftRequestInput = DraftRequestFields;
export type CreateDraftRequestInput = z.infer<typeof CreateDraftRequestInput>;

export const UpdateDraftRequestInput = z.intersection(
  DraftRequestFields,
  z.object({ requestId: z.number().int().positive() })
);
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

export const RejectRequestDocumentInput = z.object({
  requestId: z.number().int().positive(),
  type: z.enum(["registration_sheet", "hrbl_request_form"]),
  reason: z.string().min(1),
});
export type RejectRequestDocumentInput = z.infer<typeof RejectRequestDocumentInput>;

// unitPrice is optional: admin may override the resolved catalog/regional
// price at approval time, matching the validated prototype's
// approveRequest(requestId, unitPriceOverride) — AdminRequestDetail.tsx lets
// admin type/edit it before approving rather than silently trusting pricing.
export const ApproveRequestInput = z.object({
  requestId: z.number().int().positive(),
  unitPrice: z.coerce.number().positive().optional(),
});
export type ApproveRequestInput = z.infer<typeof ApproveRequestInput>;

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

export const ReassignRequestInput = z.object({
  requestId: z.coerce.number().int().positive(),
  // null puts the request back into the region's pool.
  adminUserId: z.string().uuid().nullable(),
});
export type ReassignRequestInput = z.infer<typeof ReassignRequestInput>;

export const ChangeRequestCourseInput = z.object({
  requestId: z.coerce.number().int().positive(),
  courseId: z.coerce.number().int().positive(),
});
export type ChangeRequestCourseInput = z.infer<typeof ChangeRequestCourseInput>;
