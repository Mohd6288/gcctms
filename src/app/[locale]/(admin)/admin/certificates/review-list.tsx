"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DocumentPreview } from "@/components/documents/document-preview";
import { useRouter } from "@/i18n/navigation";
import { rejectEmployeeDocumentAction, verifyEmployeeDocumentAction } from "@/modules/platform/storage/actions";

export interface PendingEmployeeDocument {
  id: number;
  type: string;
  originalName: string;
  mimeType: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  employeeNameEn: string;
  employeeNameAr: string;
  companyName: string;
  companyRegion: string | null;
  courseCode: string | null;
  courseTitleEn: string | null;
  courseTitleAr: string | null;
}

export function EmployeeDocumentReviewList({
  documents,
  locale,
}: {
  documents: PendingEmployeeDocument[];
  locale: string;
}) {
  const t = useTranslations("admin.externalCertificates");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function run(work: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await work();
        setRejectingId(null);
        setReason("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("genericError"));
      }
    });
  }

  if (documents.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {documents.map((doc) => {
        const isIqama = doc.type === "national_id";
        return (
          <div key={doc.id} className="flex flex-col gap-2 rounded-xl p-4 ring-1 ring-foreground/10">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-sm font-medium">{locale === "ar" ? doc.employeeNameAr : doc.employeeNameEn}</span>
              <span className="text-xs text-muted-foreground">{doc.companyName}</span>
              {doc.companyRegion ? <span className="text-xs text-muted-foreground">· {doc.companyRegion}</span> : null}
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  isIqama ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                }`}
              >
                {isIqama ? t("typeIqama") : t("typeCertificate")}
              </span>
            </div>

            {isIqama ? null : (
              <p className="text-sm">
                {doc.courseCode} — {locale === "ar" ? doc.courseTitleAr : doc.courseTitleEn}
              </p>
            )}
            {doc.expiresAt ? (
              <p className="text-xs text-muted-foreground">
                {doc.issuedAt ? `${t("issuedAt")}: ${doc.issuedAt} · ` : ""}
                {t("expiresAt")}: {doc.expiresAt}
              </p>
            ) : null}

            <DocumentPreview documentId={doc.id} mimeType={doc.mimeType} fileName={doc.originalName} />

            {rejectingId === doc.id ? (
              <div className="flex flex-col gap-2">
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reasonPlaceholder")} />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={pending || reason.trim() === ""}
                    onClick={() => run(() => rejectEmployeeDocumentAction(doc.id, reason))}
                  >
                    {t("confirmReject")}
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setRejectingId(null)}>
                    {t("cancel")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button type="button" size="sm" disabled={pending} onClick={() => run(() => verifyEmployeeDocumentAction(doc.id))}>
                  {t("verify")}
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setRejectingId(doc.id)}>
                  {t("reject")}
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
