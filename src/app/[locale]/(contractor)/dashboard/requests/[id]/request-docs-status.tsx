"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { uploadDocumentAction } from "@/modules/platform/storage/actions";
import { DocumentUploadSlot, type DocumentSlotStatus } from "@/components/documents/document-upload-slot";

const XLSX_ACCEPT = ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

interface RequestDoc {
  id: number;
  type: "registration_sheet" | "hrbl_request_form";
  originalName: string;
  verifiedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
}

// Read-only status for both request-level documents once a request is no
// longer in an editable status (see EDITABLE_STATUSES in page.tsx) — EXCEPT
// a rejected document, which stays re-uploadable in place: only that one
// document resets, the request itself doesn't reopen or change status.
export function RequestDocsStatus({
  requestId,
  companyId,
  requestDocs,
}: {
  requestId: number;
  companyId: number;
  requestDocs: RequestDoc[];
}) {
  const t = useTranslations("contractor.requests");
  const tDocs = useTranslations("contractor.requests.documents");
  const router = useRouter();
  const [docs, setDocs] = useState(requestDocs);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleReupload(type: "registration_sheet" | "hrbl_request_form", file: File) {
    setError(null);
    setUploadingType(type);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("companyId", String(companyId));
      formData.set("requestId", String(requestId));
      formData.set("type", type);
      const uploaded = await uploadDocumentAction(formData);
      setDocs((prev) => [
        ...prev.filter((d) => d.type !== type),
        { id: uploaded.id, type, originalName: file.name, verifiedAt: null, rejectedAt: null, rejectionReason: null },
      ]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setUploadingType(null);
    }
  }

  if (docs.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">{t("wizard.stepDocuments")}</p>
      {docs.map((doc) => {
        const isRegistrationSheet = doc.type === "registration_sheet";
        const status: DocumentSlotStatus = doc.rejectedAt ? "rejected" : doc.verifiedAt ? "verified" : "pending";
        return (
          <DocumentUploadSlot
            key={doc.type}
            title={tDocs(isRegistrationSheet ? "registrationSheet" : "hrblForm")}
            description={tDocs(isRegistrationSheet ? "registrationSheetDescription" : "hrblFormDescription")}
            required
            accept={XLSX_ACCEPT}
            acceptHint={tDocs("acceptHintXlsx")}
            status={status}
            fileName={doc.originalName}
            downloadUrl={`/api/documents/${doc.id}/download`}
            rejectionReason={doc.rejectionReason}
            uploading={uploadingType === doc.type}
            onSelectFile={(file) => handleReupload(doc.type, file)}
            readOnly={status !== "rejected"}
          />
        );
      })}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
