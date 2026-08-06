// platform/storage — Private Supabase Storage bucket access — signed URL issuance only, never public URLs.
import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { companies, documents } from "@/db/schema";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize, type AuthContext } from "@/modules/platform/auth/shared";
import { writeAudit } from "@/modules/platform/audit/service";

const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);
const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
// registration_sheet/hrbl_request_form are the two real GCC Lab request
// forms — the contractor downloads a blank .xlsx template and re-uploads it
// filled in, so these two types (and only these two) must accept Excel
// files instead of the image/PDF types every other document type takes.
const XLSX_DOCUMENT_TYPES = new Set(["registration_sheet", "hrbl_request_form"]);
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // matches the "documents" bucket's own file_size_limit
const SIGNED_URL_TTL_SECONDS = 300; // <= 5 min, per security-and-hosting.md

// national_id/prior_certificate are employee-scoped (Phase 3);
// registration_sheet/hrbl_request_form are request-scoped, required +
// admin-verified before a request can be approved (Phase 4 — see
// database-schema.md's documents note). sadad_invoice is also
// request-scoped — the contractor's SADAD receipt (Phase 5).
export type DocumentType = "national_id" | "prior_certificate" | "other" | "registration_sheet" | "hrbl_request_form" | "sadad_invoice";

// Some browsers/OS combos report .xlsx uploads as application/octet-stream
// (or no type at all) when MIME sniffing fails — fall back to the file
// extension rather than reject a genuinely correct file for those users.
function isAcceptableFile(type: DocumentType, file: File): boolean {
  if (XLSX_DOCUMENT_TYPES.has(type)) {
    if (file.type === XLSX_MIME_TYPE) return true;
    return (file.type === "" || file.type === "application/octet-stream") && file.name.toLowerCase().endsWith(".xlsx");
  }
  return IMAGE_MIME_TYPES.has(file.type);
}

export interface UploadDocumentInput {
  companyId: number;
  employeeId?: number | null;
  requestId?: number | null;
  type: DocumentType;
  file: File;
}

// Mirrors documents' actual RLS policies exactly (0009_documents.sql):
// platform_admin has a blanket policy, contractor_manager is scoped to its
// own company_id, and there is NO super_admin policy — see the identical
// note in modules/employees/service.ts.
// Drizzle bypasses RLS (see db/index.ts), so a region-assigned platform_admin
// (Phase 5) is checked against the company's own region here too — RLS
// would otherwise be the only thing stopping them reaching another
// region's documents by a known/guessed document id.
async function assertCanTouchCompany(context: AuthContext, companyId: number) {
  if (context.role === "platform_admin") {
    if (!context.region) return;
    const [company] = await db.select({ region: companies.region }).from(companies).where(eq(companies.id, companyId));
    if (company?.region === context.region) return;
    throw new Error("Not authorized");
  }
  if (context.role === "contractor_manager" && context.companyId === companyId) return;
  throw new Error("Not authorized");
}

export async function uploadDocument(context: AuthContext, input: UploadDocumentInput) {
  if (!authorize("upload_documents", context)) throw new Error("Not authorized");
  await assertCanTouchCompany(context, input.companyId);

  if (!isAcceptableFile(input.type, input.file)) {
    throw new Error(
      XLSX_DOCUMENT_TYPES.has(input.type)
        ? "Unsupported file type. Only an Excel (.xlsx) file is allowed."
        : "Unsupported file type. Only JPG, PNG, or PDF are allowed."
    );
  }
  if (input.file.size > MAX_SIZE_BYTES) {
    throw new Error("File is too large. Maximum size is 10MB.");
  }

  const bytes = Buffer.from(await input.file.arrayBuffer());
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const objectKey = randomUUID(); // opaque — no PII, no company/employee id in the key itself
  const contentType = XLSX_DOCUMENT_TYPES.has(input.type) ? XLSX_MIME_TYPE : input.file.type;

  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage.from("documents").upload(objectKey, bytes, {
    contentType,
    upsert: false,
  });
  if (uploadError) throw new Error("Upload failed. Please try again.");

  // documents has `unique (request_id, type) where request_id is not null`
  // — request-scoped types (registration_sheet/hrbl_request_form/
  // sadad_invoice) allow only one active document per slot. Re-uploading
  // replaces it in place (same row id — payments.document_id and any other
  // FK pointing at it stays valid, since that FK is ON DELETE RESTRICT) and
  // drops verification, never keeps history — see database-schema.md's
  // documents note. The verification-protecting trigger clears
  // verified_by/verified_at on this UPDATE, which is exactly the wanted
  // behavior here.
  if (input.requestId != null) {
    const [existing] = await db
      .select({ id: documents.id, objectKey: documents.objectKey })
      .from(documents)
      .where(and(eq(documents.requestId, input.requestId), eq(documents.type, input.type)));
    if (existing) {
      await admin.storage.from("documents").remove([existing.objectKey]);
      await db
        .update(documents)
        .set({
          originalName: input.file.name,
          mimeType: contentType,
          sizeBytes: bytes.length,
          checksumSha256: checksum,
          uploadedBy: context.userId,
          objectKey,
        })
        .where(eq(documents.id, existing.id));
      await writeAudit({ userId: context.userId, entityType: "document", entityId: existing.id, action: "replace" });
      return { id: existing.id };
    }
  }

  const [doc] = await db
    .insert(documents)
    .values({
      companyId: input.companyId,
      employeeId: input.employeeId ?? null,
      requestId: input.requestId ?? null,
      type: input.type,
      bucket: "documents",
      objectKey,
      originalName: input.file.name,
      mimeType: contentType,
      sizeBytes: bytes.length,
      checksumSha256: checksum,
      uploadedBy: context.userId,
    })
    .returning({ id: documents.id });

  await writeAudit({ userId: context.userId, entityType: "document", entityId: doc.id, action: "upload" });

  return doc;
}

// Issues a short-lived signed URL after checking the caller actually owns
// (or platform_admin-administers) the document — never a public/permanent
// URL. Throws "Not authorized" for cross-tenant attempts, which
// src/app/api/documents/[id]/download/route.ts turns into a 403.
export async function getSignedDownloadUrl(context: AuthContext, documentId: number): Promise<string> {
  if (!authorize("upload_documents", context)) throw new Error("Not authorized");

  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId));
  if (!doc) throw new Error("Not found");
  await assertCanTouchCompany(context, doc.companyId);

  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(doc.bucket).createSignedUrl(doc.objectKey, SIGNED_URL_TTL_SECONDS);
  if (error || !data) throw new Error("Could not generate download link.");

  await writeAudit({ userId: context.userId, entityType: "document", entityId: doc.id, action: "download" });

  return data.signedUrl;
}
