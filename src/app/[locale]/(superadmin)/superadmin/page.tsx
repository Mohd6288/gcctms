import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { authorize, getContext } from "@/modules/platform/auth/service";
import { getPlatformOverviewStats } from "@/modules/catalog/queries";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function SuperAdminHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("superadmin.overview");

  const context = await getContext();
  const stats = authorize("view_reports", context) ? await getPlatformOverviewStats() : null;

  const metrics = stats
    ? [
        { label: t("companies"), value: stats.companies },
        { label: t("employees"), value: stats.employees },
        { label: t("activeClasses"), value: stats.activeClasses },
        { label: t("certificatesIssued"), value: stats.certificatesIssued },
        { label: t("revenue"), value: Number(stats.revenue).toLocaleString(locale, { minimumFractionDigits: 2 }) },
      ]
    : [];

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {metrics.map((metric) => (
          <Card key={metric.label}>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">{metric.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{metric.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="outline">
          <Link href="/superadmin/catalog">{t("linkCatalog")}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/superadmin/exams">{t("linkExams")}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/superadmin/centers">{t("linkCenters")}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/superadmin/trainers">{t("linkTrainers")}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/superadmin/users">{t("linkUsers")}</Link>
        </Button>
      </div>
    </div>
  );
}
