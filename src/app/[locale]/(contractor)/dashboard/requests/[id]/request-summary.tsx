import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface RequestSummaryProps {
  locale: string;
  status: string;
  courseTitleEn: string;
  courseTitleAr: string;
  totalAmount: string | null;
  adminNote: string | null;
  rejectedReason: string | null;
  items: Array<{ id: number; employeeFullNameEn: string; employeeFullNameAr: string; decision: string }>;
  requestDocs: Array<{ type: "registration_sheet" | "hrbl_request_form"; verifiedAt: string | null }>;
}

export async function RequestSummary({
  locale,
  status,
  courseTitleEn,
  courseTitleAr,
  totalAmount,
  adminNote,
  rejectedReason,
  items,
  requestDocs,
}: RequestSummaryProps) {
  const t = await getTranslations("contractor.requests");
  const tSummary = await getTranslations("contractor.requests.summary");
  const tDocs = await getTranslations("contractor.requests.documents");
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

        {requestDocs.length > 0 ? (
          <div>
            <p className="text-sm font-medium">{t("wizard.stepDocuments")}</p>
            <ul className="text-sm text-muted-foreground">
              {requestDocs.map((doc) => (
                <li key={doc.type}>
                  {tDocs(doc.type === "registration_sheet" ? "registrationSheet" : "hrblForm")}:{" "}
                  {doc.verifiedAt ? tDocs("verified") : tDocs("pendingVerification")}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

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
