import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RequestDocsStatus } from "./request-docs-status";

interface RequestSummaryProps {
  locale: string;
  requestId: number;
  companyId: number;
  status: string;
  courseTitleEn: string;
  courseTitleAr: string;
  totalAmount: string | null;
  adminNote: string | null;
  rejectedReason: string | null;
  items: Array<{ id: number; employeeFullNameEn: string; employeeFullNameAr: string; decision: string }>;
  requestDocs: Array<{
    id: number;
    type: "registration_sheet" | "hrbl_request_form";
    originalName: string;
    verifiedAt: string | null;
    rejectedAt: string | null;
    rejectionReason: string | null;
  }>;
}

export async function RequestSummary({
  locale,
  requestId,
  companyId,
  status,
  courseTitleEn,
  courseTitleAr,
  totalAmount,
  adminNote,
  rejectedReason,
  items,
  requestDocs,
}: RequestSummaryProps) {
  const tSummary = await getTranslations("contractor.requests.summary");
  const tStatus = await getTranslations("requestStatus");

  const decisionLabel: Record<string, string> = {
    pending: tSummary("decisionPending"),
    approved: tSummary("decisionApproved"),
    rejected: tSummary("decisionRejected"),
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>
          {locale === "ar" ? courseTitleAr : courseTitleEn} — {tStatus(status)}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {adminNote ? (
          <p className="text-sm">
            <span className="font-medium">{tSummary("adminNote")}:</span> {adminNote}
          </p>
        ) : null}
        {rejectedReason ? (
          <p className="text-sm text-destructive">
            <span className="font-medium">{tSummary("rejectedReason")}:</span> {rejectedReason}
          </p>
        ) : null}
        {totalAmount ? (
          <p className="text-sm">
            <span className="font-medium">{tSummary("total")}:</span> {totalAmount} SAR
          </p>
        ) : null}

        {requestDocs.length > 0 ? <RequestDocsStatus requestId={requestId} companyId={companyId} requestDocs={requestDocs} /> : null}

        <div>
          <p className="text-sm font-medium">{tSummary("employeesTitle")}</p>
          <ul className="text-sm text-muted-foreground">
            {items.map((item) => (
              <li key={item.id}>
                {locale === "ar" ? item.employeeFullNameAr : item.employeeFullNameEn} —{" "}
                {decisionLabel[item.decision] ?? item.decision}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
