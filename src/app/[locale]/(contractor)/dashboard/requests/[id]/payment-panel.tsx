"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter } from "@/i18n/navigation";
import { uploadPaymentReceiptAction } from "@/modules/payments/actions";
import { DocumentPreview } from "@/components/documents/document-preview";

interface Payment {
  id: number;
  dueDate: string | null;
  totalAmount: string | null;
  status: "uploaded" | "verified" | "rejected";
  documentId: number | null;
  documentMimeType: string | null;
  quotationDocumentId: number | null;
  quotationMimeType: string | null;
  quotationName: string | null;
  rejectionReason: string | null;
}

export function PaymentPanel({ requestId, payment }: { requestId: number; payment: Payment }) {
  const t = useTranslations("contractor.requests.payment");
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // No quotation, nothing to pay against: the receipt upload only appears
  // once the contractor has the document that says what to pay and how.
  const canUpload = payment.status !== "verified" && payment.quotationDocumentId !== null;

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

        {payment.dueDate ? (
          <p className="text-sm">
            <span className="font-medium">{t("dueDate")}:</span> {payment.dueDate}
          </p>
        ) : null}
        {/* Until the quotation arrives the figure above is the portal's own
            estimate, and there are no payment instructions to act on — so say
            that plainly rather than leaving a total sitting next to an upload
            box, which reads as "pay this now". */}
        {payment.quotationDocumentId ? (
          <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <span className="text-sm font-medium">{t("quotationTitle")}</span>
            <p className="text-xs text-muted-foreground">{t("quotationHint")}</p>
            <DocumentPreview
              documentId={payment.quotationDocumentId}
              mimeType={payment.quotationMimeType}
              fileName={payment.quotationName}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-1 rounded-lg border border-warning/40 bg-warning/10 p-3">
            <span className="text-sm font-medium text-warning">{t("awaitingQuotationTitle")}</span>
            <p className="text-xs text-muted-foreground">{t("awaitingQuotationHint")}</p>
          </div>
        )}

        <p className="text-sm text-muted-foreground">{statusLabel}</p>
        {payment.status === "rejected" && payment.rejectionReason ? (
          <p className="text-sm text-destructive">
            <span className="font-medium">{t("rejectionReason")}:</span> {payment.rejectionReason}
          </p>
        ) : null}

        {payment.documentId ? (
          <DocumentPreview documentId={payment.documentId} mimeType={payment.documentMimeType} />
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
