"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarList } from "@/components/charts/BarList";
import { RankedBarList } from "@/components/charts/RankedBarList";
import { StackedStatusBar } from "@/components/charts/StackedStatusBar";
import { Sparkline } from "@/components/charts/Sparkline";
import { ChartErrorBoundary } from "@/components/charts/ChartErrorBoundary";
import { percentDelta, periodLabel, resolvedDateRangeLabel, rollingMonthOptions, type ComparisonBasis } from "@/modules/reporting/period";

const selectClassName =
  "h-8 rounded-lg border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

interface ReportSummary {
  verifiedRevenue: number;
  outstanding: number;
  certificatesIssued: number;
  completionRate: number;
  totalRequests: number;
  activeCompanies: number;
  activeLearners: number;
  avgRevenuePerCourse: number;
}

function currency(n: number): string {
  return `SAR ${Math.round(n).toLocaleString()}`;
}

function StatTile({
  label,
  value,
  compareValue,
  trail,
}: {
  label: string;
  value: number;
  compareValue: number;
  trail?: number[];
  format?: (n: number) => string;
}) {
  const delta = percentDelta(value, compareValue);
  return (
    <Card size="sm">
      <CardContent className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold">{value}</p>
          {delta !== null ? (
            <p className={delta >= 0 ? "text-xs text-emerald-600" : "text-xs text-red-600"}>
              {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}%
            </p>
          ) : null}
        </div>
        {trail ? <Sparkline values={trail} /> : null}
      </CardContent>
    </Card>
  );
}

export function ReportsView({
  locale,
  mode,
  value,
  basis,
  summary,
  compareSummary,
  revenueByCourse,
  requestsByRegion,
  requestsByStatus,
  revenueTrail,
  certsTrail,
  yearOptions,
}: {
  locale: string;
  mode: "month" | "year";
  value: string;
  basis: ComparisonBasis;
  summary: ReportSummary;
  compareSummary: ReportSummary;
  revenueByCourse: { courseId: number; code: string; titleEn: string; titleAr: string; revenue: number }[];
  requestsByRegion: { region: string; value: number }[];
  requestsByStatus: { status: string; value: number }[];
  revenueTrail: number[];
  certsTrail: number[];
  yearOptions: string[];
}) {
  const t = useTranslations("admin.reports");
  const router = useRouter();

  function navigate(next: Partial<{ mode: string; value: string; basis: string }>) {
    const params = new URLSearchParams({ mode, value, basis, ...next });
    router.push(`/admin/reports?${params.toString()}`);
  }

  const statusLabels: Record<string, string> = {
    draft: t("status.draft"),
    submitted: t("status.submitted"),
    info_requested: t("status.infoRequested"),
    rejected: t("status.rejected"),
    payment_pending: t("status.paymentPending"),
    ready_for_scheduling: t("status.readyForScheduling"),
    scheduled: t("status.scheduled"),
    completed: t("status.completed"),
  };

  function exportCsv() {
    const lines: string[] = [];
    lines.push(`Report period,${periodLabel({ mode, value } as never)}`);
    lines.push("");
    lines.push("Metric,Value");
    lines.push(`Verified revenue,${summary.verifiedRevenue}`);
    lines.push(`Outstanding,${summary.outstanding}`);
    lines.push(`Certificates issued,${summary.certificatesIssued}`);
    lines.push(`Completion rate,${Math.round(summary.completionRate * 100)}%`);
    lines.push(`Total requests,${summary.totalRequests}`);
    lines.push(`Active companies,${summary.activeCompanies}`);
    lines.push(`Active learners,${summary.activeLearners}`);
    lines.push(`Avg revenue per course,${summary.avgRevenuePerCourse}`);
    lines.push("");
    lines.push("Revenue by course");
    lines.push("Code,Title,Revenue");
    for (const c of revenueByCourse) lines.push(`${c.code},"${c.titleEn}",${c.revenue}`);
    lines.push("");
    lines.push("Requests by region");
    lines.push("Region,Count");
    for (const r of requestsByRegion) lines.push(`${r.region},${r.value}`);
    lines.push("");
    lines.push("Requests by status");
    lines.push("Status,Count");
    for (const s of requestsByStatus) lines.push(`${s.status},${s.value}`);

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${mode}-${value}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-lg font-semibold">{t("title")}</h1>
          <p className="text-xs text-muted-foreground">{resolvedDateRangeLabel({ mode, value } as never)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className={selectClassName} value={mode} onChange={(e) => navigate({ mode: e.target.value, value: e.target.value === "year" ? (yearOptions[0] ?? String(new Date().getFullYear())) : rollingMonthOptions()[0].value })}>
            <option value="month">{t("periodMonth")}</option>
            <option value="year">{t("periodYear")}</option>
          </select>
          {mode === "month" ? (
            <select className={selectClassName} value={value} onChange={(e) => navigate({ value: e.target.value })}>
              {rollingMonthOptions().map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <select className={selectClassName} value={value} onChange={(e) => navigate({ value: e.target.value })}>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          )}
          <select className={selectClassName} value={basis} onChange={(e) => navigate({ basis: e.target.value })}>
            <option value="previous">{t("basisPrevious")}</option>
            <option value="yearAgo">{t("basisYearAgo")}</option>
          </select>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            {t("exportCsv")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            {t("print")}
          </Button>
        </div>
      </div>

      <ChartErrorBoundary>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label={t("tileRevenue")} value={summary.verifiedRevenue} compareValue={compareSummary.verifiedRevenue} trail={revenueTrail} />
          <StatTile label={t("tileOutstanding")} value={summary.outstanding} compareValue={compareSummary.outstanding} />
          <StatTile label={t("tileCertificates")} value={summary.certificatesIssued} compareValue={compareSummary.certificatesIssued} trail={certsTrail} />
          <StatTile label={t("tileCompletionRate")} value={Math.round(summary.completionRate * 100)} compareValue={Math.round(compareSummary.completionRate * 100)} />
          <StatTile label={t("tileTotalRequests")} value={summary.totalRequests} compareValue={compareSummary.totalRequests} />
          <StatTile label={t("tileActiveCompanies")} value={summary.activeCompanies} compareValue={compareSummary.activeCompanies} />
          <StatTile label={t("tileActiveLearners")} value={summary.activeLearners} compareValue={compareSummary.activeLearners} />
          <StatTile label={t("tileAvgRevenue")} value={Math.round(summary.avgRevenuePerCourse)} compareValue={Math.round(compareSummary.avgRevenuePerCourse)} />
        </div>
      </ChartErrorBoundary>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartErrorBoundary>
          <Card>
            <CardHeader>
              <CardTitle>{t("revenueByCourse")}</CardTitle>
            </CardHeader>
            <CardContent>
              <RankedBarList
                items={revenueByCourse.map((c) => ({
                  label: c.code,
                  sublabel: locale === "ar" ? c.titleAr : c.titleEn,
                  value: c.revenue,
                  displayValue: currency(c.revenue),
                }))}
              />
            </CardContent>
          </Card>
        </ChartErrorBoundary>

        <ChartErrorBoundary>
          <Card>
            <CardHeader>
              <CardTitle>{t("requestsByRegion")}</CardTitle>
            </CardHeader>
            <CardContent>
              <BarList items={requestsByRegion.map((r) => ({ label: r.region, value: r.value, displayValue: String(r.value) }))} />
            </CardContent>
          </Card>
        </ChartErrorBoundary>
      </div>

      <ChartErrorBoundary>
        <Card>
          <CardHeader>
            <CardTitle>{t("requestsByStatus")}</CardTitle>
          </CardHeader>
          <CardContent>
            <StackedStatusBar items={requestsByStatus.map((s) => ({ status: s.status, label: statusLabels[s.status] ?? s.status, value: s.value }))} />
          </CardContent>
        </Card>
      </ChartErrorBoundary>
    </div>
  );
}
