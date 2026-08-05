import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getContext } from "@/modules/platform/auth/service";
import { listActiveCourses, getRequestById, getRequestItems, getRequestLevelDocuments } from "@/modules/requests/queries";
import { listActiveJobRoles, listEmployeesForCompany } from "@/modules/employees/queries";
import { getCompanyEmployeeIdsWithNationalId } from "@/modules/platform/storage/queries";
import { getPaymentForRequest } from "@/modules/payments/queries";
import { RequestWizard } from "./request-wizard";
import { RequestSummary } from "./request-summary";
import { PaymentPanel } from "./payment-panel";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

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
            .map((d) => ({ type: d.type, verifiedAt: d.verifiedAt ? d.verifiedAt.toISOString() : null }))}
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

  const [courses, companyEmployees, employeeIdsWithNationalId, jobRoles] = await Promise.all([
    listActiveCourses(context.companyId),
    listEmployeesForCompany(context.companyId),
    getCompanyEmployeeIdsWithNationalId(context.companyId),
    listActiveJobRoles(context.companyId),
  ]);

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <RequestWizard
        requestId={request.id}
        initialFields={{
          courseId: request.courseId,
          preferredRegion: request.preferredRegion,
          preferredCity: request.preferredCity,
          preferredTrainingType: request.preferredTrainingType,
          preferredStartDate: request.preferredStartDate,
          preferredEndDate: request.preferredEndDate,
          notes: request.notes,
        }}
        companyId={context.companyId}
        courses={courses}
        companyEmployees={companyEmployees.map((e) => ({
          id: e.id,
          fullNameEn: e.fullNameEn,
          fullNameAr: e.fullNameAr,
          hasNationalId: employeeIdsWithNationalId.has(e.id),
        }))}
        initialSelectedEmployeeIds={items.map((i) => i.employeeId)}
        initialRequestDocs={requestDocs
          .filter((d): d is typeof d & { type: "registration_sheet" | "hrbl_request_form" } =>
            d.type === "registration_sheet" || d.type === "hrbl_request_form"
          )
          .map((d) => ({ id: d.id, type: d.type, originalName: d.originalName, verifiedAt: d.verifiedAt ? d.verifiedAt.toISOString() : null }))}
        jobRoles={jobRoles}
        locale={locale}
      />
    </div>
  );
}
