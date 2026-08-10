import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { authorize, getContext } from "@/modules/platform/auth/service";
import { getAuditOverview } from "@/modules/audit/queries";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const dynamic = "force-dynamic";

export default async function AuditorOverviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auditor.overview");

  const context = await getContext();
  if (!authorize("view_audit_portal", context)) return null;
  const stats = await getAuditOverview();

  const tiles = [
    { label: t("companies"), value: stats.companies },
    { label: t("employees"), value: stats.employees },
    { label: t("requestsOpen"), value: stats.requests_open },
    { label: t("classesRunning"), value: stats.classes_running },
    { label: t("certificatesIssued"), value: stats.certificates_issued },
    { label: t("certificatesRevoked"), value: stats.certificates_revoked },
  ];

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-xl p-4 ring-1 ring-foreground/10">
            <p className="text-sm text-muted-foreground">{tile.label}</p>
            <p className="mt-1 text-2xl font-semibold">{tile.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
