"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DocumentPreview } from "@/components/documents/document-preview";
import { useRouter } from "@/i18n/navigation";
import {
  approveRequestAction,
  rejectRequestAction,
  rejectRequestDocumentAction,
  requestMoreInfoAction,
  setEmployeeDecisionAction,
  verifyRequestDocumentAction,
} from "@/modules/requests/actions";

interface RequestItem {
  id: number;
  employeeFullNameEn: string;
  employeeFullNameAr: string;
  decision: string;
  decisionReason: string | null;
}

interface RequestDoc {
  id: number;
  type: "registration_sheet" | "hrbl_request_form";
  mimeType?: string | null;
  verifiedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
}

export function ReviewPanel({
  requestId,
  items,
  requestDocs,
  locale,
}: {
  requestId: number;
  items: RequestItem[];
  requestDocs: RequestDoc[];
  locale: string;
}) {
  const t = useTranslations("admin.requests.detail");
  const router = useRouter();

  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showInfoForm, setShowInfoForm] = useState(false);
  const [infoMessage, setInfoMessage] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [docRejectReasons, setDocRejectReasons] = useState<Record<string, string>>({});
  const [showDocRejectForm, setShowDocRejectForm] = useState<string | null>(null);

  const bothDocsVerified =
    requestDocs.find((d) => d.type === "registration_sheet")?.verifiedAt != null &&
    requestDocs.find((d) => d.type === "hrbl_request_form")?.verifiedAt != null;

  async function handleDecision(requestItemId: number, decision: "approved" | "rejected") {
    setError(null);
    setLoading(`decision-${requestItemId}`);
    try {
      await setEmployeeDecisionAction({ requestItemId, decision, decisionReason: reasons[requestItemId] || undefined });
      router.refresh();
    } catch {
      setError(t("genericError"));
    } finally {
      setLoading(null);
    }
  }

  async function handleVerify(type: "registration_sheet" | "hrbl_request_form") {
    setError(null);
    setLoading(`verify-${type}`);
    try {
      await verifyRequestDocumentAction({ requestId, type });
      router.refresh();
    } catch {
      setError(t("genericError"));
    } finally {
      setLoading(null);
    }
  }

  async function handleRejectDoc(type: "registration_sheet" | "hrbl_request_form") {
    const reason = docRejectReasons[type];
    if (!reason) return;
    setError(null);
    setLoading(`reject-doc-${type}`);
    try {
      await rejectRequestDocumentAction({ requestId, type, reason });
      setShowDocRejectForm(null);
      router.refresh();
    } catch {
      setError(t("genericError"));
    } finally {
      setLoading(null);
    }
  }

  async function handleApprove() {
    setError(null);
    setLoading("approve");
    try {
      await approveRequestAction({ requestId, unitPrice: unitPrice ? Number(unitPrice) : undefined });
      router.push("/admin/requests");
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
      await rejectRequestAction({ requestId, reason: rejectReason });
      router.push("/admin/requests");
      router.refresh();
    } catch {
      setError(t("genericError"));
    } finally {
      setLoading(null);
    }
  }

  async function handleRequestInfo() {
    setError(null);
    setLoading("info");
    try {
      await requestMoreInfoAction({ requestId, message: infoMessage });
      router.push("/admin/requests");
      router.refresh();
    } catch {
      setError(t("genericError"));
    } finally {
      setLoading(null);
    }
  }

  const decisionLabel: Record<string, string> = {
    pending: t("decisionPending"),
    approved: t("decisionApproved"),
    rejected: t("decisionRejected"),
  };

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h2 className="text-sm font-medium">{t("documentsTitle")}</h2>
        <div className="mt-2 flex flex-col gap-2">
          {(["registration_sheet", "hrbl_request_form"] as const).map((type) => {
            const doc = requestDocs.find((d) => d.type === type);
            const statusLabel = doc?.rejectedAt ? t("rejected") : doc?.verifiedAt ? t("verified") : doc ? t("pendingVerification") : t("notAttached");
            const statusClass = doc?.rejectedAt
              ? "bg-destructive/15 text-destructive"
              : doc?.verifiedAt
                ? "bg-success/15 text-success"
                : doc
                  ? "bg-warning/15 text-warning"
                  : "bg-muted text-muted-foreground";
            return (
              <div key={type} className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span>{t(type === "registration_sheet" ? "registrationSheet" : "hrblForm")}</span>
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusClass}`}>{statusLabel}</span>

                    {doc && !doc.verifiedAt ? (
                      <Button type="button" size="sm" variant="outline" disabled={loading === `verify-${type}`} onClick={() => handleVerify(type)}>
                        {t("verify")}
                      </Button>
                    ) : null}
                    {doc && !doc.rejectedAt ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setShowDocRejectForm((s) => (s === type ? null : type))}
                      >
                        {t("rejectDocument")}
                      </Button>
                    ) : null}
                  </div>
                </div>

                {doc ? <DocumentPreview documentId={doc.id} mimeType={doc.mimeType ?? null} /> : null}

                {doc?.rejectedAt && doc.rejectionReason ? (
                  <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                    <span className="font-medium">{t("rejectReasonLabel")}: </span>
                    {doc.rejectionReason}
                  </p>
                ) : null}

                {showDocRejectForm === type ? (
                  <div className="flex flex-col gap-2 rounded-lg border border-border p-2">
                    <label className="text-xs text-muted-foreground">{t("rejectReasonLabel")}</label>
                    <Input
                      value={docRejectReasons[type] ?? ""}
                      onChange={(e) => setDocRejectReasons((prev) => ({ ...prev, [type]: e.target.value }))}
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={!docRejectReasons[type] || loading === `reject-doc-${type}`}
                        onClick={() => handleRejectDoc(type)}
                      >
                        {t("rejectConfirm")}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setShowDocRejectForm(null)}>
                        {t("cancel")}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-medium">{t("employeesTitle")}</h2>
        <div className="mt-2 flex flex-col gap-2">
          {items.map((item) => (
            <div key={item.id} className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm">
              <div className="flex items-center justify-between">
                <span>{locale === "ar" ? item.employeeFullNameAr : item.employeeFullNameEn}</span>
                <span className="text-xs text-muted-foreground">{decisionLabel[item.decision] ?? item.decision}</span>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  placeholder={t("reasonPlaceholder")}
                  value={reasons[item.id] ?? item.decisionReason ?? ""}
                  onChange={(e) => setReasons((prev) => ({ ...prev, [item.id]: e.target.value }))}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={loading === `decision-${item.id}`}
                  onClick={() => handleDecision(item.id, "approved")}
                >
                  {t("decisionApproved")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={loading === `decision-${item.id}`}
                  onClick={() => handleDecision(item.id, "rejected")}
                >
                  {t("decisionRejected")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        {!bothDocsVerified ? <p className="text-xs text-muted-foreground">{t("approveBlocked")}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder={t("unitPriceLabel")}
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            className="w-56"
          />
          <Button type="button" disabled={!bothDocsVerified || loading === "approve"} onClick={handleApprove}>
            {t("approve")}
          </Button>
          <Button type="button" variant="outline" onClick={() => setShowRejectForm((s) => !s)}>
            {t("reject")}
          </Button>
          <Button type="button" variant="outline" onClick={() => setShowInfoForm((s) => !s)}>
            {t("requestInfo")}
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

        {showInfoForm ? (
          <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <label className="text-xs text-muted-foreground">{t("requestInfoMessageLabel")}</label>
            <Input value={infoMessage} onChange={(e) => setInfoMessage(e.target.value)} />
            <div className="flex gap-2">
              <Button type="button" size="sm" disabled={!infoMessage || loading === "info"} onClick={handleRequestInfo}>
                {t("requestInfoConfirm")}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowInfoForm(false)}>
                {t("cancel")}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
