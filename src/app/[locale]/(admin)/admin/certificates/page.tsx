import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { authorize, getContext } from "@/modules/platform/auth/service";
import { listPendingEmployeeDocuments } from "@/modules/platform/storage/queries";
import { EmployeeDocumentReviewList } from "./review-list";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const dynamic = "force-dynamic";

// Review queue for employee-scoped evidence: Iqamas and externally-earned
// certificates. Both belong to an employee rather than to any one request —
// an Iqama is uploaded once, and a certificate is filed before the request
// it unblocks exists — so neither has a request-review screen it could have
// lived on. Pending certificates also block their contractor outright.
export default async function AdminEmployeeDocumentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin.externalCertificates");

  const context = await getContext();
  const pendingDocuments = authorize("review_requests", context) ? await listPendingEmployeeDocuments(context?.region) : [];

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      {context?.region ? <p className="text-sm text-muted-foreground">{t("regionScopedNote", { region: context.region })}</p> : null}
      <EmployeeDocumentReviewList documents={pendingDocuments} locale={locale} />
    </div>
  );
}
