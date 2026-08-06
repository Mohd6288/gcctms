import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { getReportSummary, getRequestsByRegion, getRequestsByStatus, getRevenueByCourse, getVerifiedRevenueByMonth, getCertificatesIssuedByMonth, listRequestYears } from "@/modules/reporting/queries";
import { comparisonPeriod, currentMonthValue, trailingMonths, yearOptionsFromDates, type ComparisonBasis, type ReportPeriod } from "@/modules/reporting/period";
import { ReportsView } from "./reports-view";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function AdminReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ mode?: string; value?: string; basis?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;

  const mode = sp.mode === "year" ? "year" : "month";
  const value = sp.value ?? (mode === "year" ? String(new Date().getFullYear()) : currentMonthValue());
  const basis: ComparisonBasis = sp.basis === "yearAgo" ? "yearAgo" : "previous";
  const period: ReportPeriod = mode === "year" ? { mode: "year", value } : { mode: "month", value };
  const comparePeriod = comparisonPeriod(period, basis);

  const trailing = trailingMonths(6);

  const [summary, compareSummary, revenueByCourse, requestsByRegion, requestsByStatus, revenueTrail, certsTrail, requestYears] = await Promise.all([
    getReportSummary(period),
    getReportSummary(comparePeriod),
    getRevenueByCourse(period),
    getRequestsByRegion(period),
    getRequestsByStatus(period),
    getVerifiedRevenueByMonth(trailing.map((m) => m.value)),
    getCertificatesIssuedByMonth(trailing.map((m) => m.value)),
    listRequestYears(),
  ]);

  return (
    <ReportsView
      locale={locale}
      mode={mode}
      value={value}
      basis={basis}
      summary={summary}
      compareSummary={compareSummary}
      revenueByCourse={revenueByCourse}
      requestsByRegion={requestsByRegion}
      requestsByStatus={requestsByStatus}
      revenueTrail={revenueTrail}
      certsTrail={certsTrail}
      yearOptions={yearOptionsFromDates(requestYears)}
    />
  );
}
