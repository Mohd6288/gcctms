import { setRequestLocale, getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { authorize, getContext } from "@/modules/platform/auth/service";
import { getRequestById, getRequestItems, getRequestLevelDocuments } from "@/modules/requests/queries";
import { getPaymentForRequest } from "@/modules/payments/queries";
import { ReviewPanel } from "./review-panel";
import { PaymentReviewPanel } from "./payment-review-panel";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

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

  if ((!canReviewRequests && !canVerifyPayments) || !request) {
    redirect({ href: "/admin/requests", locale });
    return null;
  }

  const showEmployeeReview = canReviewRequests && request.status === "submitted";
  const payment = canVerifyPayments && request.status !== "draft" && request.status !== "submitted" ? await getPaymentForRequest(requestId) : null;

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
            .map((d) => ({ id: d.id, type: d.type, verifiedAt: d.verifiedAt ? d.verifiedAt.toISOString() : null }))}
          locale={locale}
        />
      ) : null}
      {payment ? (
        <PaymentReviewPanel
          payment={{
            id: payment.id,
            totalAmount: payment.totalAmount,
            status: payment.status as "uploaded" | "verified" | "rejected",
            documentId: payment.documentId,
          }}
        />
      ) : null}
    </div>
  );
}
