"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter } from "@/i18n/navigation";
import { uploadPaymentReceiptAction } from "@/modules/payments/actions";

interface Payment {
  id: number;
  totalAmount: string | null;
  status: "uploaded" | "verified" | "rejected";
  documentId: number | null;
  rejectionReason: string | null;
}

export function PaymentPanel({ requestId, payment }: { requestId: number; payment: Payment }) {
  const t = useTranslations("contractor.requests.payment");
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canUpload = payment.status !== "verified";

  async function handleUpload() {
    const file = fileInput.current?.files?.[0];
    if (!file) return;
    setError(null);
    setLoading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("requestId", String(requestId));
      await uploadPaymentReceiptAction(formData);
      router.refresh();
    } catch {
      setError(t("genericError"));
    } finally {
      setLoading(false);
    }
  }

  const statusLabel = {
    uploaded: t("statusUploaded"),
    verified: t("statusVerified"),
    rejected: t("statusRejected"),
  }[payment.status];

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm">
          <span className="font-medium">{t("totalDue")}:</span> {payment.totalAmount ?? "—"} SAR
        </p>
        <p className="text-sm text-muted-foreground">{statusLabel}</p>
        {payment.status === "rejected" && payment.rejectionReason ? (
          <p className="text-sm text-destructive">
            <span className="font-medium">{t("rejectionReason")}:</span> {payment.rejectionReason}
          </p>
        ) : null}

        {payment.documentId ? (
          <a href={`/api/documents/${payment.documentId}/download`} className="text-sm text-primary hover:underline">
            {t("download")}
          </a>
        ) : (
          <p className="text-sm text-muted-foreground">{t("noReceiptYet")}</p>
        )}

        {canUpload ? (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">{payment.documentId ? t("reupload") : t("uploadLabel")}</label>
            <div className="flex items-center gap-2">
              <input ref={fileInput} type="file" accept="image/jpeg,image/png,application/pdf" className="text-sm" />
              <Button type="button" size="sm" disabled={loading} onClick={handleUpload}>
                {loading ? t("uploading") : t("upload")}
              </Button>
            </div>
          </div>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
