// reporting module — read-side queries (Drizzle, RLS-scoped via lib/supabase/server.ts).
import "server-only";
import { and, count, countDistinct, eq, gte, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { certificates, courses, payments, requestItems, trainingRequests } from "@/db/schema";
import { periodRange, type ReportPeriod } from "./period";
import { REGIONS } from "@/lib/regions";

const REQUEST_STATUSES = ["draft", "submitted", "info_requested", "rejected", "payment_pending", "ready_for_scheduling", "scheduled", "completed"] as const;

function num(value: string | null | undefined): number {
  return value ? Number(value) : 0;
}

// Use drizzle's count()/countDistinct() rather than a hand-written
// sql<number>`count(*)`: sql<T> is an unchecked type ASSERTION, and
// postgres.js hands back Postgres bigint counts as strings, so those
// "numbers" were strings at runtime. Silent everywhere they were only
// rendered, but not in the charts — StackedStatusBar/BarList both do
// `items.reduce((sum, i) => sum + i.value, 0)`, and "0" + "1" + "1" is
// "011", so the computed total was a concatenated string and every bar
// collapsed to a fraction-of-a-percent sliver. drizzle's helpers carry a
// .mapWith(Number), so they return real numbers. Where a plain count()
// won't do (FILTER clauses), the sql`` tag is now typed <string> honestly
// and passed through num().

// period scoping throughout uses payments.created_at (= approval/invoice
// time) for revenue, and training_requests.created_at (= submission time)
// for request/learner counts — "how much showed up in this period," not
// when it was later paid/verified.
export async function getReportSummary(period: ReportPeriod) {
  const { start, end } = periodRange(period);

  // Grouped by the table each aggregate reads rather than one query per
  // figure: eight round trips plus a getRevenueByCourse call collapse to
  // five. Identical numbers (pinned by reporting-aggregates.test.ts) —
  // FILTER just lets a single scan answer several questions at once.
  const [[paymentsRow], [certsRow], [requestsRow], [learnersRow], [allTimeRow]] = await Promise.all([
    db
      .select({
        verified: sql<string>`coalesce(sum(${payments.totalAmount}) filter (where ${payments.status} = 'verified'), 0)`,
        outstanding: sql<string>`coalesce(sum(${payments.totalAmount}) filter (where ${payments.status} <> 'verified'), 0)`,
        // Replaces counting a whole getRevenueByCourse result client-side.
        // The join can't drop rows: payments.request_id is NOT NULL with an
        // FK. Differs from the old `revenue > 0` form only for a verified
        // payment totalling exactly 0 — unreachable, since qty and
        // unit_price are both required and positive.
        coursesWithRevenue: sql<string>`count(distinct ${trainingRequests.courseId}) filter (where ${payments.status} = 'verified')`,
      })
      .from(payments)
      .innerJoin(trainingRequests, eq(payments.requestId, trainingRequests.id))
      .where(and(gte(payments.createdAt, start), lte(payments.createdAt, end))),
    db
      .select({ value: count() })
      .from(certificates)
      .where(and(eq(certificates.status, "issued"), gte(certificates.issuedAt, start), lte(certificates.issuedAt, end))),
    db
      .select({ total: count(), companies: countDistinct(trainingRequests.companyId) })
      .from(trainingRequests)
      .where(and(gte(trainingRequests.createdAt, start), lte(trainingRequests.createdAt, end))),
    db
      .select({ value: countDistinct(requestItems.employeeId) })
      .from(requestItems)
      .innerJoin(trainingRequests, eq(requestItems.requestId, trainingRequests.id))
      .where(and(gte(trainingRequests.createdAt, start), lte(trainingRequests.createdAt, end), ne(requestItems.decision, "rejected"))),
    // Completion rate is deliberately all-time, not period-scoped — a
    // period-scoped rate would misleadingly read near 0% early in any
    // period (nothing submitted this period has had time to complete yet).
    db
      .select({
        completed: sql<string>`count(*) filter (where ${trainingRequests.status} = 'completed')`,
        total: count(),
      })
      .from(trainingRequests),
  ]);

  const verifiedRevenue = num(paymentsRow.verified);
  const outstanding = num(paymentsRow.outstanding);
  const completedAllTime = num(allTimeRow.completed);
  const totalAllTime = allTimeRow.total;
  const coursesWithRevenue = num(paymentsRow.coursesWithRevenue);

  return {
    verifiedRevenue,
    outstanding,
    certificatesIssued: certsRow.value,
    completionRate: totalAllTime > 0 ? completedAllTime / totalAllTime : 0,
    totalRequests: requestsRow.total,
    activeCompanies: requestsRow.companies,
    activeLearners: learnersRow.value,
    avgRevenuePerCourse: coursesWithRevenue > 0 ? verifiedRevenue / coursesWithRevenue : 0,
  };
}

// Every course, in stable catalog (code) order — never sorted by value,
// which would imply a trend along an axis that isn't ordered by anything.
export async function getRevenueByCourse(period: ReportPeriod) {
  const { start, end } = periodRange(period);
  const rows = await db
    .select({
      courseId: courses.id,
      code: courses.code,
      titleEn: courses.titleEn,
      titleAr: courses.titleAr,
      // Date must cross as an ISO string, not a raw Date — drizzle's sql`` tag
      // with { prepare: false } fails to serialize interpolated Date objects
      // (postgres.js's Bind step expects a string/Buffer, not a Date).
      revenue: sql<string>`coalesce(sum(${payments.totalAmount}) filter (where ${payments.status} = 'verified' and ${payments.createdAt} >= ${start.toISOString()}::timestamptz and ${payments.createdAt} <= ${end.toISOString()}::timestamptz), 0)`,
    })
    .from(courses)
    .leftJoin(trainingRequests, eq(trainingRequests.courseId, courses.id))
    .leftJoin(payments, eq(payments.requestId, trainingRequests.id))
    .groupBy(courses.id, courses.code, courses.titleEn, courses.titleAr)
    .orderBy(courses.code);

  return rows.map((r) => ({ ...r, revenue: num(r.revenue) }));
}

// All 5 fixed regions always included, even at zero.
export async function getRequestsByRegion(period: ReportPeriod) {
  const { start, end } = periodRange(period);
  const rows = await db
    .select({ region: trainingRequests.preferredRegion, value: count() })
    .from(trainingRequests)
    .where(and(gte(trainingRequests.createdAt, start), lte(trainingRequests.createdAt, end)))
    .groupBy(trainingRequests.preferredRegion);

  const byRegion = new Map(rows.map((r) => [r.region, r.value]));
  return REGIONS.map((region) => ({ region, value: byRegion.get(region) ?? 0 }));
}

// All 8 statuses always included, even at zero.
export async function getRequestsByStatus(period: ReportPeriod) {
  const { start, end } = periodRange(period);
  const rows = await db
    .select({ status: trainingRequests.status, value: count() })
    .from(trainingRequests)
    .where(and(gte(trainingRequests.createdAt, start), lte(trainingRequests.createdAt, end)))
    .groupBy(trainingRequests.status);

  const byStatus = new Map(rows.map((r) => [r.status, r.value]));
  return REQUEST_STATUSES.map((status) => ({ status, value: byStatus.get(status) ?? 0 }));
}

// Sparkline trails, one query each rather than one per month. The page asks
// for 6 months, so this replaced 12 round trips with 2. Returns a value per
// requested month in the order given, zero-filled for months with no rows —
// the caller must get back exactly as many points as it asked for, or the
// sparkline silently shifts along its x-axis.
function monthKey(monthValue: string): string {
  return monthValue.slice(0, 7);
}

export async function getVerifiedRevenueByMonth(monthValues: string[]): Promise<number[]> {
  if (monthValues.length === 0) return [];
  const { start } = periodRange({ mode: "month", value: monthValues[0] });
  const { end } = periodRange({ mode: "month", value: monthValues[monthValues.length - 1] });

  const bucket = sql`date_trunc('month', ${payments.createdAt} at time zone 'UTC')`;
  const rows = await db
    .select({
      month: sql<string>`to_char(${bucket}, 'YYYY-MM')`,
      total: sql<string>`coalesce(sum(${payments.totalAmount}), 0)`,
    })
    .from(payments)
    .where(and(eq(payments.status, "verified"), gte(payments.createdAt, start), lte(payments.createdAt, end)))
    .groupBy(bucket);

  const byMonth = new Map(rows.map((r) => [r.month, num(r.total)]));
  return monthValues.map((v) => byMonth.get(monthKey(v)) ?? 0);
}

export async function getCertificatesIssuedByMonth(monthValues: string[]): Promise<number[]> {
  if (monthValues.length === 0) return [];
  const { start } = periodRange({ mode: "month", value: monthValues[0] });
  const { end } = periodRange({ mode: "month", value: monthValues[monthValues.length - 1] });

  const bucket = sql`date_trunc('month', ${certificates.issuedAt} at time zone 'UTC')`;
  const rows = await db
    .select({ month: sql<string>`to_char(${bucket}, 'YYYY-MM')`, value: count() })
    .from(certificates)
    .where(and(eq(certificates.status, "issued"), gte(certificates.issuedAt, start), lte(certificates.issuedAt, end)))
    .groupBy(bucket);

  const byMonth = new Map(rows.map((r) => [r.month, r.value]));
  return monthValues.map((v) => byMonth.get(monthKey(v)) ?? 0);
}

// For the year-option dropdown — every year that has at least one request.
// DISTINCT in SQL: this used to select every training_requests row in the
// table just to read the year off each one, which is the one query here
// that would degrade without bound as the platform fills up.
export async function listRequestYears(): Promise<Date[]> {
  const rows = await db
    .selectDistinct({ year: sql<number>`extract(year from ${trainingRequests.createdAt} at time zone 'UTC')::int` })
    .from(trainingRequests);
  return rows.map((r) => new Date(Date.UTC(Number(r.year), 0, 1)));
}
