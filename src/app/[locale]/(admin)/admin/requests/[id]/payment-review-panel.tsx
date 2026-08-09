"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { rejectPaymentAction, verifyPaymentAction } from "@/modules/payments/actions";
import { DocumentPreview } from "@/components/documents/document-preview";

interface Payment {
  id: number;
  sadadInvoiceRef: string | null;
  dueDate: string | null;
  totalAmount: string | null;
  status: "uploaded" | "verified" | "rejected";
  documentId: number | null;
  documentMimeType: string | null;
}

export function PaymentReviewPanel({ payment }: { payment: Payment }) {
  const t = useTranslations("admin.payments.detail");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  async function handleVerify() {
    setError(null);
    setLoading("verify");
    try {
      await verifyPaymentAction(payment.id);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setLoading(null);
    }
  }

  async function handleReject() {
    setError(null);
    setLoading("reject");
    try {
      await rejectPaymentAction({ paymentId: payment.id, reason: rejectReason });
      setShowRejectForm(false);
      setRejectReason("");
      router.refresh();
    } catch {
      setError(t("genericError"));
    } finally {
      setLoading(null);
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
        {payment.sadadInvoiceRef ? (
          <p className="text-sm">
            <span className="font-medium">{t("sadadReference")}:</span> {payment.sadadInvoiceRef}
          </p>
        ) : null}
        {payment.dueDate ? (
          <p className="text-sm">
            <span className="font-medium">{t("dueDate")}:</span> {payment.dueDate}
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">{statusLabel}</p>

        {/* Verifying a SADAD receipt means reading the reference and amount
            off it — doing that from a download link meant leaving the page
            that has the Verify button. */}
        {payment.documentId ? (
          <DocumentPreview documentId={payment.documentId} mimeType={payment.documentMimeType} />
        ) : (
          <p className="text-sm text-muted-foreground">{t("noReceiptYet")}</p>
        )}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {payment.status === "uploaded" && payment.documentId ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" disabled={loading === "verify"} onClick={handleVerify}>
                {t("verify")}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowRejectForm((s) => !s)}>
                {t("reject")}
              </Button>
            </div>
            {showRejectForm ? (
              <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
                <label className="text-xs text-muted-foreground">{t("rejectReasonLabel")}</label>
                <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
                <div className="flex gap-2">
                  <Button type="button" size="sm" disabled={!rejectReason || loading === "reject"} onClick={handleReject}>
                    {t("rejectConfirm")}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setShowRejectForm(false)}>
                    {t("cancel")}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
