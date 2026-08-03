"use server";

import { getContext } from "@/modules/platform/auth/service";
import { uploadDocument, type DocumentType } from "./service";

export async function uploadDocumentAction(formData: FormData) {
  const context = await getContext();
  if (!context) throw new Error("Not authorized");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("No file provided");

  const companyId = Number(formData.get("companyId"));
  const type = formData.get("type") as DocumentType;
  const employeeIdRaw = formData.get("employeeId");
  const employeeId = employeeIdRaw ? Number(employeeIdRaw) : null;

  return uploadDocument(context, { companyId, employeeId, type, file });
}
