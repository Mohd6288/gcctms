import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { authorize, getContext } from "@/modules/platform/auth/service";
import { listPendingExternalCertificates } from "@/modules/platform/storage/queries";
import { ExternalCertificateReviewList } from "./review-list";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const dynamic = "force-dynamic";

// Review queue for certificates employees already hold from outside this
// platform. These block their contractor: a request can't be submitted until
// the certificate that satisfies its prerequisite is verified, and the
// certificate belongs to an employee rather than to any one request, so
// there's no request-review screen it could have lived on.
export default async function AdminExternalCertificatesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin.externalCertificates");

  const context = await getContext();
  const certificates = authorize("review_requests", context) ? await listPendingExternalCertificates(context?.region) : [];

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      {context?.region ? <p className="text-sm text-muted-foreground">{t("regionScopedNote", { region: context.region })}</p> : null}
      <ExternalCertificateReviewList certificates={certificates} locale={locale} />
    </div>
  );
}
