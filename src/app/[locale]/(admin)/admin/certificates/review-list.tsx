"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { rejectEmployeeDocumentAction, verifyEmployeeDocumentAction } from "@/modules/platform/storage/actions";

export interface PendingExternalCertificate {
  id: number;
  originalName: string;
  issuedAt: string | null;
  expiresAt: string | null;
  employeeNameEn: string;
  employeeNameAr: string;
  companyName: string;
  companyRegion: string | null;
  courseCode: string;
  courseTitleEn: string;
  courseTitleAr: string;
}

export function ExternalCertificateReviewList({
  certificates,
  locale,
}: {
  certificates: PendingExternalCertificate[];
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

  if (certificates.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {certificates.map((cert) => (
        <div key={cert.id} className="flex flex-col gap-2 rounded-xl p-4 ring-1 ring-foreground/10">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-sm font-medium">{locale === "ar" ? cert.employeeNameAr : cert.employeeNameEn}</span>
            <span className="text-xs text-muted-foreground">{cert.companyName}</span>
            {cert.companyRegion ? <span className="text-xs text-muted-foreground">· {cert.companyRegion}</span> : null}
          </div>
          <p className="text-sm">
            {cert.courseCode} — {locale === "ar" ? cert.courseTitleAr : cert.courseTitleEn}
          </p>
          <p className="text-xs text-muted-foreground">
            {cert.issuedAt ? `${t("issuedAt")}: ${cert.issuedAt} · ` : ""}
            {t("expiresAt")}: {cert.expiresAt}
          </p>
          <a href={`/api/documents/${cert.id}/download`} className="w-fit text-xs text-primary hover:underline">
            {t("viewFile")} ({cert.originalName})
          </a>

          {rejectingId === cert.id ? (
            <div className="flex flex-col gap-2">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reasonPlaceholder")} />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={pending || reason.trim() === ""}
                  onClick={() => run(() => rejectEmployeeDocumentAction(cert.id, reason))}
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
              <Button type="button" size="sm" disabled={pending} onClick={() => run(() => verifyEmployeeDocumentAction(cert.id))}>
                {t("verify")}
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setRejectingId(cert.id)}>
                {t("reject")}
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
