import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { getContext } from "@/modules/platform/auth/service";
import {
  getContractorAttentionCounts,
  getContractorOverviewStats,
  listUpcomingClassesForCompany,
} from "@/modules/catalog/queries";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const dynamic = "force-dynamic";

export default async function ContractorDashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("contractor.overview");

  const context = await getContext();
  const attention = context?.companyId
    ? await getContractorAttentionCounts(context.companyId).catch((error) => {
        console.error("[contractor] getContractorAttentionCounts failed:", error);
        return null;
      })
    : null;

  // Sequential, not Promise.all — concurrent Drizzle calls stall against the
  // Supabase pooler (see db/index.ts).
  const stats = context?.companyId ? await getContractorOverviewStats(context.companyId).catch(() => null) : null;
  const upcoming = context?.companyId ? await listUpcomingClassesForCompany(context.companyId).catch(() => []) : [];

  // Only what the contractor can act on themselves. A request sitting with
  // GCC Lab is deliberately absent: surfacing it invites chasing, not doing.
  const queues = attention
    ? [
        { label: t("queueInfoRequested"), value: attention.info_requested, href: "/dashboard/requests" },
        { label: t("queueRejectedDocuments"), value: attention.rejected_documents, href: "/dashboard/requests" },
        { label: t("queuePaymentDue"), value: attention.payment_due, href: "/dashboard/payments" },
        { label: t("queueDrafts"), value: attention.drafts, href: "/dashboard/requests" },
        { label: t("queueMissingIqama"), value: attention.employees_without_iqama, href: "/dashboard/employees" },
        { label: t("queueExpiring"), value: attention.certificates_expiring, href: "/dashboard/certificates" },
      ].filter((q) => q.value > 0)
    : [];

  const links = [
    { label: t("linkRequests"), href: "/dashboard/requests" },
    { label: t("linkTraining"), href: "/dashboard/training" },
    { label: t("linkEmployees"), href: "/dashboard/employees" },
    { label: t("linkPayments"), href: "/dashboard/payments" },
    { label: t("linkCertificates"), href: "/dashboard/certificates" },
    { label: t("linkProfile"), href: "/dashboard/profile" },
  ];

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="text-lg font-semibold">{t("title")}</h1>

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

      {stats ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: t("statEmployees"), value: stats.employees },
            { label: t("statOpenRequests"), value: stats.open_requests },
            { label: t("statUpcomingClasses"), value: stats.upcoming_classes },
            { label: t("statValidCertificates"), value: stats.valid_certificates },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col gap-1 rounded-xl p-4 ring-1 ring-foreground/10">
              <span className="text-2xl font-semibold">{stat.value}</span>
              <span className="text-xs text-muted-foreground">{stat.label}</span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Who of theirs is going where, and when — the thing a contractor
          actually signed in to find out. */}
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium">{t("upcomingTitle")}</h2>
          <Link href="/dashboard/training" className="text-xs text-primary hover:underline">
            {t("upcomingAll")}
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("upcomingEmpty")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {upcoming.map((cls) => (
              <div
                key={cls.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl p-3 ring-1 ring-foreground/10"
              >
                <span className="text-sm font-medium">
                  {cls.courseCode} — {locale === "ar" ? cls.courseTitleAr : cls.courseTitleEn}
                </span>
                <span className="text-xs text-muted-foreground">
                  {cls.startDate} → {cls.endDate} · {cls.region} · {t("upcomingAttending", { count: cls.attending })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {links.map((link) => (
          <Button key={link.href} asChild variant="outline">
            <Link href={link.href}>{link.label}</Link>
          </Button>
        ))}
      </div>
    </div>
  );
}
