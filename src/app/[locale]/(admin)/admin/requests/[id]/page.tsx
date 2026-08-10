import { setRequestLocale, getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { authorize, getContext } from "@/modules/platform/auth/service";
import { getRequestById, getRequestItems, getRequestLevelDocuments, listAssignableAdmins } from "@/modules/requests/queries";
import { listCourses } from "@/modules/catalog/queries";
import { RequestOwnershipPanel } from "./request-ownership-panel";
import { getPaymentForRequest } from "@/modules/payments/queries";
import { ReviewPanel } from "./review-panel";
import { PaymentReviewPanel } from "./payment-review-panel";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// See admin/classes/[id]/page.tsx's comment — generateStaticParams only
// covers `locale`, so every real [id] falls back to on-demand rendering;
// without this, the cookies()/DB reads below throw DYNAMIC_SERVER_USAGE in
// production.
export const dynamic = "force-dynamic";

export default async function AdminRequestDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin.requests");

  const context = await getContext();
  const requestId = Number(id);
  const request = Number.isInteger(requestId) ? await getRequestById(requestId) : null;
  const canReviewRequests = authorize("review_requests", context);
  const canVerifyPayments = authorize("verify_payments", context);

  // Drizzle bypasses RLS (see companies/queries.ts's listCompanies() note),
  // so a region-assigned admin's list already filters this out — but the
  // detail route is still reachable directly by URL/id, so deny it here too
  // rather than relying on the list page alone to keep them out.
  const regionDenied = context?.region != null && request?.companyRegion !== context.region;

  if ((!canReviewRequests && !canVerifyPayments) || !request || regionDenied) {
    redirect({ href: "/admin/requests", locale });
    return null;
  }

  const showEmployeeReview = canReviewRequests && request.status === "submitted";
  const payment = canVerifyPayments && request.status !== "draft" && request.status !== "submitted" ? await getPaymentForRequest(requestId) : null;
  const admins = await listAssignableAdmins(request.companyRegion);
  const courseOptions = (await listCourses()).filter((c) => c.active);

  const [items, requestDocs] = showEmployeeReview
    ? await Promise.all([getRequestItems(requestId), getRequestLevelDocuments(requestId)])
    : [[], []];

  return (
    <div className="flex flex-1 flex-col items-center gap-6 p-6">
      <div className="w-full max-w-2xl">
        <h1 className="text-lg font-semibold">
          {request.companyName} — {locale === "ar" ? request.courseTitleAr : request.courseTitleEn}
        </h1>
        <p className="text-sm text-muted-foreground">{t("title")}</p>
      </div>
      {showEmployeeReview ? (
        <ReviewPanel
          requestId={request.id}
          items={items}
          requestDocs={requestDocs
            .filter((d): d is typeof d & { type: "registration_sheet" | "hrbl_request_form" } =>
              d.type === "registration_sheet" || d.type === "hrbl_request_form"
            )
            .map((d) => ({
              id: d.id,
              type: d.type,
              mimeType: d.mimeType,
              verifiedAt: d.verifiedAt ? d.verifiedAt.toISOString() : null,
              rejectedAt: d.rejectedAt ? d.rejectedAt.toISOString() : null,
              rejectionReason: d.rejectionReason,
            }))}
          locale={locale}
        />
      ) : null}
      {/* Sequential, not Promise.all — concurrent Drizzle calls stall against
          the Supabase pooler (see db/index.ts). */}
      <RequestOwnershipPanel
        requestId={request.id}
        status={request.status}
        assignedAdminUserId={request.assignedAdminUserId}
        assignedAdminName={request.assignedAdminName}
        admins={admins.map((a) => ({ userId: a.user_id, fullName: a.full_name, region: a.region }))}
        courseId={request.courseId}
        courses={courseOptions}
        locale={locale}
      />

      {payment ? (
        <PaymentReviewPanel
          requestId={request.id}
          payment={{
            id: payment.id,
            dueDate: payment.dueDate,
            totalAmount: payment.totalAmount,
            status: payment.status as "uploaded" | "verified" | "rejected",
            documentId: payment.documentId,
            documentMimeType: payment.documentMimeType,
            quotationDocumentId: payment.quotationDocumentId,
            quotationMimeType: payment.quotationMimeType,
            quotationName: payment.quotationName,
          }}
        />
      ) : null}
    </div>
  );
}
