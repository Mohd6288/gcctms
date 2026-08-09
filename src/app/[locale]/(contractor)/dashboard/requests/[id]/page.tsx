import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getContext } from "@/modules/platform/auth/service";
import { listActiveCourses, getRequestById, getRequestItems, getRequestLevelDocuments } from "@/modules/requests/queries";
import { listActiveJobRoles, listEmployeesForCompany } from "@/modules/employees/queries";
import { listEmployeeDocumentsForCompany, listExternalCertificatesForCompany } from "@/modules/platform/storage/queries";
import { getPaymentForRequest } from "@/modules/payments/queries";
import { RequestWizard } from "./request-wizard";
import { RequestSummary } from "./request-summary";
import { PaymentPanel } from "./payment-panel";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// See admin/classes/[id]/page.tsx's comment — generateStaticParams only
// covers `locale`, so every real [id] falls back to on-demand rendering;
// without this, the cookies()/DB reads below throw DYNAMIC_SERVER_USAGE in
// production.
export const dynamic = "force-dynamic";

const EDITABLE_STATUSES = new Set(["draft", "info_requested"]);

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const context = await getContext();
  const requestId = Number(id);
  const request = Number.isInteger(requestId) ? await getRequestById(requestId) : null;

  if (!context?.companyId || !request || request.companyId !== context.companyId) {
    redirect({ href: "/dashboard/requests", locale });
    return null;
  }

  const [items, requestDocs] = await Promise.all([getRequestItems(requestId), getRequestLevelDocuments(requestId)]);

  if (!EDITABLE_STATUSES.has(request.status)) {
    const payment = await getPaymentForRequest(requestId);
    return (
      <div className="flex flex-1 flex-col items-center gap-6 p-6">
        <RequestSummary
          locale={locale}
          requestId={request.id}
          companyId={context.companyId}
          status={request.status}
          courseTitleEn={request.courseTitleEn}
          courseTitleAr={request.courseTitleAr}
          totalAmount={request.totalAmount}
          adminNote={request.adminNote}
          rejectedReason={request.rejectedReason}
          items={items}
          requestDocs={requestDocs
            .filter((d): d is typeof d & { type: "registration_sheet" | "hrbl_request_form" } =>
              d.type === "registration_sheet" || d.type === "hrbl_request_form"
            )
            .map((d) => ({
              id: d.id,
              type: d.type,
              originalName: d.originalName,
              verifiedAt: d.verifiedAt ? d.verifiedAt.toISOString() : null,
              rejectedAt: d.rejectedAt ? d.rejectedAt.toISOString() : null,
              rejectionReason: d.rejectionReason,
            }))}
        />
        {payment ? (
          <PaymentPanel
            requestId={requestId}
            payment={{
              id: payment.id,
              sadadInvoiceRef: payment.sadadInvoiceRef,
              dueDate: payment.dueDate,
              totalAmount: payment.totalAmount,
              status: payment.status as "uploaded" | "verified" | "rejected",
              documentId: payment.documentId,
              rejectionReason: payment.rejectionReason,
            }}
          />
        ) : null}
      </div>
    );
  }

  const [courses, companyEmployees, employeeDocuments, jobRoles] = await Promise.all([
    listActiveCourses(context.companyId),
    listEmployeesForCompany(context.companyId),
    listEmployeeDocumentsForCompany(context.companyId),
    listActiveJobRoles(context.companyId),
  ]);
  // Sequential, not a fifth entry in the Promise.all above — concurrent
  // Drizzle calls stall against the pooler under load.
  const externalCertificates = await listExternalCertificatesForCompany(context.companyId);

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <RequestWizard
        requestId={request.id}
        initialFields={{
          courseId: request.courseId,
          preferredRegion: request.preferredRegion,
          preferredCity: request.preferredCity,
          preferredTrainingType: request.preferredTrainingType,
          notes: request.notes,
        }}
        companyId={context.companyId}
        courses={courses}
        companyEmployees={companyEmployees.map((e) => ({
          id: e.id,
          fullNameEn: e.fullNameEn,
          fullNameAr: e.fullNameAr,
        }))}
        initialSelectedEmployeeIds={items.map((i) => i.employeeId)}
        initialRequestDocs={requestDocs
          .filter((d): d is typeof d & { type: "registration_sheet" | "hrbl_request_form" } =>
            d.type === "registration_sheet" || d.type === "hrbl_request_form"
          )
          .map((d) => ({
            id: d.id,
            type: d.type,
            originalName: d.originalName,
            verifiedAt: d.verifiedAt ? d.verifiedAt.toISOString() : null,
            rejectedAt: d.rejectedAt ? d.rejectedAt.toISOString() : null,
            rejectionReason: d.rejectionReason,
          }))}
        employeeDocuments={employeeDocuments}
        externalCertificates={externalCertificates}
        jobRoles={jobRoles}
        locale={locale}
      />
    </div>
  );
}
