"use client";

import { useId, useState, type DragEvent } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { DocumentPreview } from "./document-preview";

export type DocumentSlotStatus = "not_attached" | "pending" | "verified" | "rejected";

const STATUS_STYLES: Record<DocumentSlotStatus, string> = {
  not_attached: "bg-muted text-muted-foreground",
  pending: "bg-warning/15 text-warning",
  verified: "bg-success/15 text-success",
  rejected: "bg-destructive/15 text-destructive",
};

interface DocumentUploadSlotProps {
  title: string;
  description: string;
  required: boolean;
  accept: string;
  acceptHint: string;
  status: DocumentSlotStatus;
  fileName?: string | null;
  downloadUrl?: string | null;
  rejectionReason?: string | null;
  templateUrl?: string | null;
  templateLabel?: string;
  uploading: boolean;
  onSelectFile: (file: File) => void;
  readOnly?: boolean;
  // When set, the slot renders an inline preview instead of a bare download
  // link — the whole point being that reviewing a document shouldn't mean
  // downloading it first.
  documentId?: number | null;
  mimeType?: string | null;
}

// A single document's upload control — used for both request-level forms
// (Registration Sheet / HRBL_0004) and per-employee documents (ID, prior
// certificate). Designed to make three things obvious at a glance: what the
// document is and why it's needed, whether it's required, and its current
// review status — rather than a bare <input type="file"> with a status
// string next to it.
export function DocumentUploadSlot({
  title,
  description,
  required,
  accept,
  acceptHint,
  status,
  fileName,
  downloadUrl,
  rejectionReason,
  templateUrl,
  templateLabel,
  uploading,
  onSelectFile,
  readOnly = false,
  documentId,
  mimeType,
}: DocumentUploadSlotProps) {
  const t = useTranslations("documents.uploadSlot");
  const inputId = useId();
  const [dragActive, setDragActive] = useState(false);

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) onSelectFile(file);
  }

  const statusLabel: Record<DocumentSlotStatus, string> = {
    not_attached: t("notAttached"),
    pending: t("pendingVerification"),
    verified: t("verified"),
    rejected: t("rejected"),
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{title}</span>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                required ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              )}
            >
              {required ? t("required") : t("optional")}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{description}</p>
          {templateUrl ? (
            <a href={templateUrl} download className="w-fit text-xs text-primary hover:underline">
              {templateLabel ?? t("downloadTemplate")}
            </a>
          ) : null}
        </div>
        <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium", STATUS_STYLES[status])}>
          {statusLabel[status]}
        </span>
      </div>

      {status === "rejected" && rejectionReason ? (
        <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
          <span className="font-medium">{t("rejectionReasonLabel")}: </span>
          {rejectionReason}
        </p>
      ) : null}

      {readOnly ? (
        fileName ? (
          <p className="text-xs text-muted-foreground">{fileName}</p>
        ) : null
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          className={cn(
            "flex flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed p-4 text-center transition-colors",
            dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/40"
          )}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6 text-muted-foreground" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9m0 0-3 3m3-3 3 3M6 20.25h12A2.25 2.25 0 0 0 20.25 18v-2.25M3.75 15.75V18a2.25 2.25 0 0 0 2.25 2.25" />
          </svg>
          {fileName ? (
            <span className="max-w-full truncate text-xs font-medium text-foreground">{fileName}</span>
          ) : null}
          <label htmlFor={inputId} className="cursor-pointer text-xs text-primary hover:underline">
            {fileName ? t("replaceFile") : t("dragDropHint")}
          </label>
          <span className="text-[11px] text-muted-foreground">{acceptHint}</span>
          {uploading ? <span className="text-xs text-muted-foreground">{t("uploading")}</span> : null}
          <input
            id={inputId}
            type="file"
            accept={accept}
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onSelectFile(file);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {documentId && fileName ? (
        <DocumentPreview documentId={documentId} mimeType={mimeType ?? null} />
      ) : downloadUrl && fileName ? (
        <a href={downloadUrl} className="w-fit text-xs text-primary hover:underline">
          {t("viewFile")}
        </a>
      ) : null}
    </div>
  );
}
