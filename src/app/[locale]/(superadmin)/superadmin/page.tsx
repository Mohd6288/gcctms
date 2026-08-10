import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { authorize, getContext } from "@/modules/platform/auth/service";
import { getAttentionCounts, getPlatformOverviewStats } from "@/modules/catalog/queries";

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
  const stats = authorize("view_reports", context)
    ? await getPlatformOverviewStats().catch((error) => {
        console.error("[superadmin] getPlatformOverviewStats failed:", error);
        return null;
      })
    : null;
  // Sequential, not Promise.all — concurrent Drizzle calls stall against the
  // pooler (see getPlatformOverviewStats' own note).
  const attention = authorize("view_reports", context)
    ? await getAttentionCounts().catch((error) => {
        console.error("[superadmin] getAttentionCounts failed:", error);
        return null;
      })
    : null;

  // Only what is actually waiting on someone, each linked to the screen that
  // clears it. A zero is dropped rather than shown as a reassuring "0" — the
  // point of this block is that an empty one means nothing needs doing.
  const queues = attention
    ? [
        { label: t("queueRequests"), value: attention.requests_to_review, href: "/admin/requests" },
        { label: t("queuePayments"), value: attention.payments_to_verify, href: "/admin/payments" },
        { label: t("queueDocuments"), value: attention.documents_to_verify, href: "/admin/certificates" },
        { label: t("queueCertificates"), value: attention.certificates_to_approve, href: "/admin/classes" },
        { label: t("queueTrainerLogins"), value: attention.trainers_without_login, href: "/superadmin/trainers" },
        { label: t("queueNeverSignedIn"), value: attention.accounts_never_signed_in, href: "/superadmin/users" },
      ].filter((q) => q.value > 0)
    : [];

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
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">{t("needsAttention")}</h2>
        {queues.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("allClear")}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {queues.map((queue) => (
              <Link
                key={queue.label}
                href={queue.href}
                className="flex items-center justify-between rounded-xl p-4 ring-1 ring-foreground/10 transition-colors hover:bg-muted/50"
              >
                <span className="text-sm">{queue.label}</span>
                <span className="rounded-full bg-warning/15 px-2.5 py-0.5 text-sm font-semibold text-warning">{queue.value}</span>
              </Link>
            ))}
          </div>
        )}
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
