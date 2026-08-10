import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { authorize, getContext } from "@/modules/platform/auth/service";
import { getAdminAttentionCounts } from "@/modules/catalog/queries";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const dynamic = "force-dynamic";

export default async function AdminHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin.overview");

  const context = await getContext();
  // Region-scoped: an admin assigned to a region must not be shown another
  // region's backlog, or they will either work it or assume it is handled.
  const attention = authorize("review_requests", context)
    ? await getAdminAttentionCounts(context?.region).catch((error) => {
        console.error("[admin] getAdminAttentionCounts failed:", error);
        return null;
      })
    : null;

  const queues = attention
    ? [
        { label: t("queueRequests"), value: attention.requests_to_review, href: "/admin/requests" },
        { label: t("queueDocuments"), value: attention.documents_to_verify, href: "/admin/certificates" },
        { label: t("queuePayments"), value: attention.payments_to_verify, href: "/admin/payments" },
        { label: t("queueScheduling"), value: attention.awaiting_scheduling, href: "/admin/scheduling" },
        { label: t("queueCertificates"), value: attention.certificates_to_approve, href: "/admin/classes" },
      ].filter((q) => q.value > 0)
    : [];

  const links = [
    { label: t("linkRequests"), href: "/admin/requests" },
    { label: t("linkPayments"), href: "/admin/payments" },
    { label: t("linkScheduling"), href: "/admin/scheduling" },
    { label: t("linkCalendar"), href: "/admin/calendar" },
    { label: t("linkClasses"), href: "/admin/classes" },
    { label: t("linkCompanies"), href: "/admin/companies" },
    { label: t("linkEmployees"), href: "/admin/employees" },
    { label: t("linkDocuments"), href: "/admin/certificates" },
    { label: t("linkReports"), href: "/admin/reports" },
  ];

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        {context?.region ? <p className="text-sm text-muted-foreground">{t("regionScopedNote", { region: context.region })}</p> : null}
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
        {links.map((link) => (
          <Button key={link.href} asChild variant="outline">
            <Link href={link.href}>{link.label}</Link>
          </Button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">{t("certificateHint")}</p>
    </div>
  );
}
