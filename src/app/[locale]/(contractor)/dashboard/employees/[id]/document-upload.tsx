"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter } from "@/i18n/navigation";
import { uploadDocumentAction } from "@/modules/platform/storage/actions";

type DocType = "national_id" | "prior_certificate" | "other";

interface ExistingDocument {
  id: number;
  type: DocType;
  originalName: string;
}

export function DocumentUpload({
  companyId,
  employeeId,
  documents,
}: {
  companyId: number;
  employeeId: number;
  documents: ExistingDocument[];
}) {
  const t = useTranslations("contractor.documents");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [uploadingType, setUploadingType] = useState<DocType | null>(null);
  const fileInputs = {
    national_id: useRef<HTMLInputElement>(null),
    prior_certificate: useRef<HTMLInputElement>(null),
    other: useRef<HTMLInputElement>(null),
  };

  async function handleUpload(type: DocType) {
    const file = fileInputs[type].current?.files?.[0];
    if (!file) return;
    setError(null);
    setUploadingType(type);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("companyId", String(companyId));
      formData.set("employeeId", String(employeeId));
      formData.set("type", type);
      await uploadDocumentAction(formData);
      router.refresh();
    } catch {
      setError(t("genericError"));
    } finally {
      setUploadingType(null);
    }
  }

  const rows: { type: DocType; label: string }[] = [
    { type: "national_id", label: t("nationalId") },
    { type: "prior_certificate", label: t("priorCertificate") },
    { type: "other", label: t("other") },
  ];

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {rows.map(({ type, label }) => {
          const existing = documents.find((d) => d.type === type);
          return (
            <div key={type} className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{label}</span>
                <span className="text-xs text-muted-foreground">{existing ? t("uploaded") : t("notUploaded")}</span>
              </div>
              {existing ? (
                <a href={`/api/documents/${existing.id}/download`} className="text-sm text-primary hover:underline">
                  {t("download")}
                </a>
              ) : null}
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputs[type]}
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  className="text-sm"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={uploadingType === type}
                  onClick={() => handleUpload(type)}
                >
                  {uploadingType === type ? t("uploading") : t("upload")}
                </Button>
              </div>
            </div>
          );
        })}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
