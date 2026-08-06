import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { getReportSummary, getRequestsByRegion, getRequestsByStatus, getRevenueByCourse, getVerifiedRevenueByMonth, getCertificatesIssuedByMonth, listRequestYears } from "@/modules/reporting/queries";
import { comparisonPeriod, currentMonthValue, trailingMonths, yearOptionsFromDates, type ComparisonBasis, type ReportPeriod } from "@/modules/reporting/period";
import { ReportsView } from "./reports-view";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// Temporary instrumentation while confirming the 300s-timeout fix below.
// Logs to Vercel runtime logs, so if this page ever stalls again the last
// "reports:" line names exactly which call is stuck instead of leaving a
// bare timeout with no stack. Remove once this has been green for a while.
async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try {
    const result = await fn();
    console.log(`reports: ${name} ok in ${Date.now() - t0}ms`);
    return result;
  } catch (err) {
    console.error(`reports: ${name} FAILED after ${Date.now() - t0}ms`, err);
    throw err;
  }
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

  // Sequential, NOT Promise.all — deliberate, and the reason this page
  // works at all. It used to fan every call out concurrently, and in
  // production the function never returned: Vercel killed it at the 300s
  // runtime timeout with no database error logged, on a request that had
  // already sent its response. It reproduces on nothing else, and never
  // locally.
  //
  // What makes this page unique is concurrency, not volume: every other
  // page issues one query and needs one connection, while this one issued
  // ~16 at once against db/index.ts's `max: 3` pool. It is the only page
  // that ever asks Supabase's transaction pooler for a second and third
  // connection at the same time, and that is where it stalls — invisible
  // locally, where Postgres is a direct connection with no pooler in front.
  //
  // Serialising costs nothing now that functions run in fra1 beside the
  // database (vercel.json): each query is ~2ms, measured at 5ms for the
  // whole fan-out over a 3,000-request fixture. Concurrency was buying
  // single-digit milliseconds and costing the entire page.
  const summary = await step("summary", () => getReportSummary(period));
  const compareSummary = await step("compareSummary", () => getReportSummary(comparePeriod));
  const revenueByCourse = await step("revenueByCourse", () => getRevenueByCourse(period));
  const requestsByRegion = await step("requestsByRegion", () => getRequestsByRegion(period));
  const requestsByStatus = await step("requestsByStatus", () => getRequestsByStatus(period));
  const revenueTrail = await step("revenueTrail", () => getVerifiedRevenueByMonth(trailing.map((m) => m.value)));
  const certsTrail = await step("certsTrail", () => getCertificatesIssuedByMonth(trailing.map((m) => m.value)));
  const requestYears = await step("requestYears", () => listRequestYears());

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
