// requests module — read-side queries (Drizzle, RLS-scoped via lib/supabase/server.ts).
import "server-only";
import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, courses, documents, employees, pricing, requestItems, trainingRequests } from "@/db/schema";

export async function listRequestsForCompany(companyId: number) {
  return db
    .select({
      id: trainingRequests.id,
      status: trainingRequests.status,
      courseTitleEn: courses.titleEn,
      courseTitleAr: courses.titleAr,
      totalAmount: trainingRequests.totalAmount,
      createdAt: trainingRequests.createdAt,
    })
    .from(trainingRequests)
    .innerJoin(courses, eq(trainingRequests.courseId, courses.id))
    .where(eq(trainingRequests.companyId, companyId))
    .orderBy(desc(trainingRequests.createdAt));
}

// Admin review queue — only "submitted" requests, per Phase 4's scope
// (nothing to review outside that status).
//
// region: Drizzle bypasses RLS, so a region-assigned platform_admin
// (Phase 5) needs this filter applied explicitly here too — see
// companies/queries.ts's listCompanies() for the same note.
export async function listSubmittedRequestsForAdmin(region?: string | null) {
  return db
    .select({
      id: trainingRequests.id,
      companyName: companies.name,
      courseTitleEn: courses.titleEn,
      courseTitleAr: courses.titleAr,
      createdAt: trainingRequests.createdAt,
    })
    .from(trainingRequests)
    .innerJoin(courses, eq(trainingRequests.courseId, courses.id))
    .innerJoin(companies, eq(trainingRequests.companyId, companies.id))
    .where(region ? and(eq(trainingRequests.status, "submitted"), eq(companies.region, region)) : eq(trainingRequests.status, "submitted"))
    .orderBy(desc(trainingRequests.createdAt));
}

export async function getRequestById(requestId: number) {
  const [request] = await db
    .select({
      id: trainingRequests.id,
      companyId: trainingRequests.companyId,
      companyName: companies.name,
      companyRegion: companies.region,
      courseId: trainingRequests.courseId,
      courseTitleEn: courses.titleEn,
      courseTitleAr: courses.titleAr,
      status: trainingRequests.status,
      preferredRegion: trainingRequests.preferredRegion,
      preferredCity: trainingRequests.preferredCity,
      preferredTrainingType: trainingRequests.preferredTrainingType,
      preferredStartDate: trainingRequests.preferredStartDate,
      preferredEndDate: trainingRequests.preferredEndDate,
      notes: trainingRequests.notes,
      totalAmount: trainingRequests.totalAmount,
      adminNote: trainingRequests.adminNote,
      rejectedReason: trainingRequests.rejectedReason,
      createdAt: trainingRequests.createdAt,
    })
    .from(trainingRequests)
    .innerJoin(courses, eq(trainingRequests.courseId, courses.id))
    .innerJoin(companies, eq(trainingRequests.companyId, companies.id))
    .where(eq(trainingRequests.id, requestId));
  return request ?? null;
}

export async function getRequestItems(requestId: number) {
  return db
    .select({
      id: requestItems.id,
      employeeId: requestItems.employeeId,
      employeeFullNameEn: employees.fullNameEn,
      employeeFullNameAr: employees.fullNameAr,
      status: requestItems.status,
      decision: requestItems.decision,
      decisionReason: requestItems.decisionReason,
      // approveRequest blocks until every billable employee's Iqama is
      // verified, so the reviewer needs to see that per row rather than
      // discovering it as an error after clicking Approve.
      //
      // ::int is load-bearing, not decoration. sql<T> is an unchecked type
      // ASSERTION and postgres.js hands back a Postgres bigint as a STRING
      // (same trap the reporting module documents above its count() helpers)
      // — so without the cast this "number" reached
      // verifyEmployeeDocumentAction as "123", failed its z.number() parse,
      // and the admin got a generic "something went wrong" instead of a
      // verified Iqama.
      iqamaDocumentId: sql<number | null>`(
        select d.id::int from documents d
        where d.employee_id = ${employees.id} and d.type = 'national_id'
        order by d.id desc limit 1
      )`,
      iqamaMimeType: sql<string | null>`(
        select d.mime_type from documents d
        where d.employee_id = ${employees.id} and d.type = 'national_id'
        order by d.id desc limit 1
      )`,
      iqamaVerified: sql<boolean>`exists (
        select 1 from documents d
        where d.employee_id = ${employees.id} and d.type = 'national_id' and d.verified_at is not null
      )`,
    })
    .from(requestItems)
    .innerJoin(employees, eq(requestItems.employeeId, employees.id))
    .where(eq(requestItems.requestId, requestId));
}

// The two request-level documents (registration_sheet, hrbl_request_form) —
// never the employee-scoped national_id/prior_certificate ones.
// The price a contractor is shown while building a request. It must resolve
// exactly the way resolvePrice() does in requests/service.ts, because that
// is the number approveRequest will actually invoice — an estimate computed
// by different rules is worse than no estimate.
//
// Same precedence: an active row for the specific region wins over an active
// region-null default ("order by region nulls last"), and the latest
// effective_from wins within each. Resolved in JS rather than SQL so the
// whole matrix comes back in one round trip instead of one query per
// (course, region) the wizard might switch to.
//
// price is numeric(10,2), which postgres.js returns as a STRING. It stays a
// string all the way to the UI; the only arithmetic is done after an
// explicit Number() at the point of use — "500.00" * 3 is the kind of thing
// that silently produces nonsense.
export async function listEffectiveCoursePrices(courseIds: number[]) {
  if (courseIds.length === 0) return [] as { courseId: number; region: string | null; price: string }[];

  const rows = await db
    .select({
      courseId: pricing.courseId,
      region: pricing.region,
      price: pricing.price,
      effectiveFrom: pricing.effectiveFrom,
    })
    .from(pricing)
    .where(
      and(
        inArray(pricing.courseId, courseIds),
        lte(pricing.effectiveFrom, sql`current_date`),
        or(isNull(pricing.effectiveTo), gte(pricing.effectiveTo, sql`current_date`))
      )
    );

  // Latest effective row per (course, region), then let a region-specific
  // row shadow the region-null default for that region.
  const best = new Map<string, { courseId: number; region: string | null; price: string; effectiveFrom: string }>();
  for (const row of rows) {
    const key = `${row.courseId}|${row.region ?? ""}`;
    const current = best.get(key);
    if (!current || row.effectiveFrom > current.effectiveFrom) best.set(key, row);
  }

  return Array.from(best.values()).map(({ courseId, region, price }) => ({ courseId, region, price }));
}

export async function getRequestLevelDocuments(requestId: number) {
  return db
    .select({
      id: documents.id,
      type: documents.type,
      originalName: documents.originalName,
      mimeType: documents.mimeType,
      verifiedAt: documents.verifiedAt,
      rejectedAt: documents.rejectedAt,
      rejectionReason: documents.rejectionReason,
    })
    .from(documents)
    .where(eq(documents.requestId, requestId));
}

// Matches the validated prototype's Step1Info.tsx course filter exactly:
// a course with no contractorCategory is universal (shown to every
// company); a course WITH a category only shows to companies with that
// exact category. A company with no category set sees only universal
// courses.
export async function listActiveCourses(companyId: number) {
  const [company] = await db.select({ contractorCategory: companies.contractorCategory }).from(companies).where(eq(companies.id, companyId));
  const category = company?.contractorCategory ?? null;
  const categoryFilter = category ? or(isNull(courses.contractorCategory), eq(courses.contractorCategory, category)) : isNull(courses.contractorCategory);

  return db
    .select({ id: courses.id, code: courses.code, titleEn: courses.titleEn, titleAr: courses.titleAr })
    .from(courses)
    .where(and(eq(courses.active, true), categoryFilter))
    .orderBy(courses.titleEn);
}
