// reporting module — pure period/date-math helpers, no DB access (usable
// client-side for the period picker too, unlike queries.ts). Matches the
// validated prototype's reports.ts: month/year mode, a comparison basis
// (previous period vs. same period last year), trailing-N-month series for
// sparklines. No date-fns in this codebase — plain Date, UTC throughout to
// avoid timezone drift in month/year boundaries.
export type ReportPeriod = { mode: "month"; value: string } | { mode: "year"; value: string };
export type ComparisonBasis = "previous" | "yearAgo";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function currentMonthValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
}

export function rollingMonthOptions(): { value: string; label: string }[] {
  const now = new Date();
  const options: { value: string; label: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push({ value: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`, label: d.toLocaleDateString("en", { month: "long", year: "numeric" }) });
  }
  return options;
}

export function yearOptionsFromDates(dates: Date[]): string[] {
  const years = new Set(dates.map((d) => d.getUTCFullYear()));
  return Array.from(years)
    .sort((a, b) => b - a)
    .map(String);
}

// Inclusive [start, end] range covering the whole period, in UTC.
export function periodRange(period: ReportPeriod): { start: Date; end: Date } {
  if (period.mode === "month") {
    const [y, m] = period.value.split("-").map(Number);
    return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)) };
  }
  const y = Number(period.value);
  return { start: new Date(Date.UTC(y, 0, 1)), end: new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999)) };
}

export function previousPeriod(period: ReportPeriod): ReportPeriod {
  if (period.mode === "month") {
    const [y, m] = period.value.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 2, 1));
    return { mode: "month", value: `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-01` };
  }
  return { mode: "year", value: String(Number(period.value) - 1) };
}

// Year mode has no real distinction between the two bases — both step back
// exactly one year — kept only so the UI toggle stays consistent across
// both modes, matching the validated prototype's identical no-op note.
export function comparisonPeriod(period: ReportPeriod, basis: ComparisonBasis): ReportPeriod {
  if (basis === "previous") return previousPeriod(period);
  if (period.mode === "month") {
    const [y, m] = period.value.split("-").map(Number);
    return { mode: "month", value: `${y - 1}-${pad2(m)}-01` };
  }
  return { mode: "year", value: String(Number(period.value) - 1) };
}

export function periodLabel(period: ReportPeriod): string {
  if (period.mode === "month") {
    const [y, m] = period.value.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en", { month: "long", year: "numeric", timeZone: "UTC" });
  }
  return period.value;
}

export function resolvedDateRangeLabel(period: ReportPeriod): string {
  const { start, end } = periodRange(period);
  if (period.mode === "month") {
    return `${start.getUTCDate()}–${end.toLocaleDateString("en", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}`;
  }
  return `${start.toLocaleDateString("en", { day: "numeric", month: "short", timeZone: "UTC" })} – ${end.toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`;
}

// Oldest-first, for sparkline x-axes.
export function trailingMonths(n: number): { value: string; label: string }[] {
  const now = new Date();
  const result: { value: string; label: string }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push({ value: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`, label: d.toLocaleDateString("en", { month: "short" }) });
  }
  return result;
}

// null (not 0 or Infinity) when there's no meaningful baseline to compare
// against — a zero-to-something jump isn't a percentage.
export function percentDelta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}
