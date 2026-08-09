"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { uploadDocumentAction } from "@/modules/platform/storage/actions";
import { DocumentPreview } from "./document-preview";

export interface ExternalCertificateCourse {
  id: number;
  code: string;
  titleEn: string;
  titleAr: string;
}

export interface ExternalCertificate {
  id: number;
  employeeId: number | null;
  courseId: number | null;
  originalName: string;
  mimeType: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  verifiedAt: string | Date | null;
  rejectedAt: string | Date | null;
  rejectionReason: string | null;
}

// Lets a contractor file a certificate the employee already holds from
// outside this platform — the OHS General Induction most of all, since
// nothing else can be booked without it. It only counts once a platform
// admin verifies it, so this is a request for review, not a way around the
// gate. The unstructured "Certificate" upload slot elsewhere stays what it
// was: a supporting file nobody's eligibility depends on.
export function ExternalCertificatePanel({
  companyId,
  employeeId,
  courses,
  certificates,
  locale,
  required = false,
  onUploaded,
}: {
  companyId: number;
  employeeId: number;
  courses: ExternalCertificateCourse[];
  certificates: ExternalCertificate[];
  locale: string;
  required?: boolean;
  onUploaded?: () => void;
}) {
  const t = useTranslations("documents.externalCertificate");
  const [courseId, setCourseId] = useState<number | "">(courses[0]?.id ?? "");
  const [issuedAt, setIssuedAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = (course: ExternalCertificateCourse) => `${course.code} — ${locale === "ar" ? course.titleAr : course.titleEn}`;

  async function handleUpload() {
    if (!courseId || !file || !expiresAt) {
      setError(t("incomplete"));
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("companyId", String(companyId));
      formData.set("employeeId", String(employeeId));
      formData.set("type", "prior_certificate");
      formData.set("courseId", String(courseId));
      if (issuedAt) formData.set("issuedAt", issuedAt);
      formData.set("expiresAt", expiresAt);
      await uploadDocumentAction(formData);
      setFile(null);
      setIssuedAt("");
      setExpiresAt("");
      onUploaded?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{t("title")}</p>
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
              required ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"
            )}
          >
            {required ? t("required") : t("optional")}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{required ? t("requiredDescription") : t("description")}</p>
      </div>

      {certificates.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {certificates.map((cert) => {
            const course = courses.find((c) => c.id === cert.courseId);
            const status = cert.rejectedAt ? "rejected" : cert.verifiedAt ? "verified" : "pending";
            return (
              <li key={cert.id} className="flex flex-col gap-0.5 rounded-md bg-muted/40 p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium">{course ? title(course) : cert.originalName}</span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                      status === "verified" ? "bg-success/15 text-success" : status === "rejected" ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning"
                    )}
                  >
                    {t(status)}
                  </span>
                  {cert.expiresAt ? <span className="text-[11px] text-muted-foreground">{t("expires", { date: cert.expiresAt })}</span> : null}
                </div>
                <DocumentPreview documentId={cert.id} mimeType={cert.mimeType ?? null} fileName={cert.originalName} />
                {status === "rejected" && cert.rejectionReason ? (
                  <p className="text-[11px] text-destructive">
                    {t("rejectionReasonLabel")}: {cert.rejectionReason}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {courses.length === 0 ? null : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`external-course-${employeeId}`} className="text-xs">
              {t("courseLabel")}
            </Label>
            <select
              id={`external-course-${employeeId}`}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              value={courseId}
              onChange={(e) => setCourseId(Number(e.target.value))}
            >
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {title(course)}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`external-issued-${employeeId}`} className="text-xs">
                {t("issuedAtLabel")}
              </Label>
              <Input id={`external-issued-${employeeId}`} type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`external-expires-${employeeId}`} className="text-xs">
                {t("expiresAtLabel")}
              </Label>
              <Input id={`external-expires-${employeeId}`} type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </div>
          </div>
          <input
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            className="text-xs"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={handleUpload} className="w-fit">
            {uploading ? t("uploading") : t("upload")}
          </Button>
          <p className="text-[11px] text-muted-foreground">{t("reviewNote")}</p>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
      )}
    </div>
  );
}
