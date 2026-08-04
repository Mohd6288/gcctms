// reporting module — read-side queries (Drizzle, RLS-scoped via lib/supabase/server.ts).
import "server-only";
import { and, countDistinct, eq, gte, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { certificates, courses, payments, requestItems, trainingRequests } from "@/db/schema";
import { periodRange, type ReportPeriod } from "./period";

const REGIONS = ["North", "South", "East", "West", "Central"] as const;
const REQUEST_STATUSES = ["draft", "submitted", "info_requested", "rejected", "payment_pending", "ready_for_scheduling", "scheduled", "completed"] as const;

function num(value: string | null | undefined): number {
  return value ? Number(value) : 0;
}

// period scoping throughout uses payments.created_at (= approval/invoice
// time) for revenue, and training_requests.created_at (= submission time)
// for request/learner counts — "how much showed up in this period," not
// when it was later paid/verified.
export async function getReportSummary(period: ReportPeriod) {
  const { start, end } = periodRange(period);

  const [[verifiedRow], [outstandingRow], [certsRow], [requestsRow], [companiesRow], [learnersRow], [completedRow], [totalRequestsAllTimeRow]] = await Promise.all([
    db
      .select({ total: sql<string>`coalesce(sum(${payments.totalAmount}), 0)` })
      .from(payments)
      .where(and(eq(payments.status, "verified"), gte(payments.createdAt, start), lte(payments.createdAt, end))),
    db
      .select({ total: sql<string>`coalesce(sum(${payments.totalAmount}), 0)` })
      .from(payments)
      .where(and(ne(payments.status, "verified"), gte(payments.createdAt, start), lte(payments.createdAt, end))),
    db
      .select({ value: sql<number>`count(*)` })
      .from(certificates)
      .where(and(eq(certificates.status, "issued"), gte(certificates.issuedAt, start), lte(certificates.issuedAt, end))),
    db
      .select({ value: sql<number>`count(*)` })
      .from(trainingRequests)
      .where(and(gte(trainingRequests.createdAt, start), lte(trainingRequests.createdAt, end))),
    db
      .select({ value: countDistinct(trainingRequests.companyId) })
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
    db.select({ value: sql<number>`count(*) filter (where ${trainingRequests.status} = 'completed')` }).from(trainingRequests),
    db.select({ value: sql<number>`count(*)` }).from(trainingRequests),
  ]);

  const verifiedRevenue = num(verifiedRow.total);
  const outstanding = num(outstandingRow.total);
  const completedAllTime = completedRow.value;
  const totalAllTime = totalRequestsAllTimeRow.value;

  const revenueByCourse = await getRevenueByCourse(period);
  const coursesWithRevenue = revenueByCourse.filter((c) => c.revenue > 0).length;

  return {
    verifiedRevenue,
    outstanding,
    certificatesIssued: certsRow.value,
    completionRate: totalAllTime > 0 ? completedAllTime / totalAllTime : 0,
    totalRequests: requestsRow.value,
    activeCompanies: companiesRow.value,
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
    .select({ region: trainingRequests.preferredRegion, value: sql<number>`count(*)` })
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
    .select({ status: trainingRequests.status, value: sql<number>`count(*)` })
    .from(trainingRequests)
    .where(and(gte(trainingRequests.createdAt, start), lte(trainingRequests.createdAt, end)))
    .groupBy(trainingRequests.status);

  const byStatus = new Map(rows.map((r) => [r.status, r.value]));
  return REQUEST_STATUSES.map((status) => ({ status, value: byStatus.get(status) ?? 0 }));
}

export async function getVerifiedRevenueForMonth(monthValue: string): Promise<number> {
  const { start, end } = periodRange({ mode: "month", value: monthValue });
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${payments.totalAmount}), 0)` })
    .from(payments)
    .where(and(eq(payments.status, "verified"), gte(payments.createdAt, start), lte(payments.createdAt, end)));
  return num(row.total);
}

export async function getCertificatesIssuedForMonth(monthValue: string): Promise<number> {
  const { start, end } = periodRange({ mode: "month", value: monthValue });
  const [row] = await db
    .select({ value: sql<number>`count(*)` })
    .from(certificates)
    .where(and(eq(certificates.status, "issued"), gte(certificates.issuedAt, start), lte(certificates.issuedAt, end)));
  return row.value;
}

// For the year-option dropdown — every year that has at least one request.
export async function listRequestYears(): Promise<Date[]> {
  const rows = await db.select({ createdAt: trainingRequests.createdAt }).from(trainingRequests);
  return rows.map((r) => r.createdAt);
}
