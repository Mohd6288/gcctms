"use server";

import { z } from "zod";
import { getContext } from "@/modules/platform/auth/service";
import { rejectEmployeeDocument, uploadDocument, verifyEmployeeDocument, type DocumentType } from "./service";

const DOCUMENT_TYPES = ["national_id", "prior_certificate", "other", "registration_sheet", "hrbl_request_form", "sadad_invoice"] as const;

// FormData carries everything as strings, so coerce before validating rather
// than casting — this is a trust boundary (Golden Rule 2) and the
// external-certificate fields feed a gate that decides who may train.
const UploadDocumentFields = z.object({
  companyId: z.coerce.number().int().positive(),
  type: z.enum(DOCUMENT_TYPES),
  employeeId: z.coerce.number().int().positive().nullable(),
  requestId: z.coerce.number().int().positive().nullable(),
  courseId: z.coerce.number().int().positive().nullable(),
  issuedAt: z.string().date().nullable(),
  expiresAt: z.string().date().nullable(),
});

function optional(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value !== "" ? value : null;
}

export async function uploadDocumentAction(formData: FormData) {
  const context = await getContext();
  if (!context) throw new Error("Not authorized");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("No file provided");

  const fields = UploadDocumentFields.parse({
    companyId: formData.get("companyId"),
    type: formData.get("type"),
    employeeId: optional(formData, "employeeId"),
    requestId: optional(formData, "requestId"),
    courseId: optional(formData, "courseId"),
    issuedAt: optional(formData, "issuedAt"),
    expiresAt: optional(formData, "expiresAt"),
  });

  return uploadDocument(context, { ...fields, type: fields.type as DocumentType, file });
}

export async function verifyEmployeeDocumentAction(documentId: number) {
  const context = await getContext();
  if (!context) throw new Error("Not authorized");
  await verifyEmployeeDocument(context, z.number().int().positive().parse(documentId));
}

export async function rejectEmployeeDocumentAction(documentId: number, reason: string) {
  const context = await getContext();
  if (!context) throw new Error("Not authorized");
  const input = z.object({ documentId: z.number().int().positive(), reason: z.string().trim().min(1).max(500) }).parse({ documentId, reason });
  await rejectEmployeeDocument(context, input.documentId, input.reason);
}
