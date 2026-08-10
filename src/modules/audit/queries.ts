// audit module — read-only, platform-wide views for the auditor portal.
//
// Every query here names its columns explicitly and never selects
// employees.national_id_enc / national_id_hash. That is the masking
// decision, and it lives here rather than in a policy because RLS is
// row-level: it can withhold a row but not a column. Auditors have no RLS
// policies at all (0033), so this module is the only path to the data.
import "server-only";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { certificates, classes, companies, courses, employees, profiles, requestItems, trainingRequests } from "@/db/schema";
import { auditLog } from "@/db/schema";

export async function getAuditOverview() {
  const [row] = await db.execute<{
    companies: number;
    employees: number;
    requests_open: number;
    classes_running: number;
    certificates_issued: number;
    certificates_revoked: number;
  }>(sql`
    select
      (select count(*)::int from ${companies}) as companies,
      (select count(*)::int from ${employees}) as employees,
      (select count(*)::int from ${trainingRequests} where ${trainingRequests.status} not in ('completed', 'rejected')) as requests_open,
      (select count(*)::int from ${classes} where ${classes.status} = 'in_progress') as classes_running,
      (select count(*)::int from ${certificates} where ${certificates.status} = 'issued') as certificates_issued,
      (select count(*)::int from ${certificates} where ${certificates.status} = 'revoked') as certificates_revoked
  `);
  return row;
}

export async function listAuditRequests(limit = 500) {
  return db
    .select({
      id: trainingRequests.id,
      status: trainingRequests.status,
      companyName: companies.name,
      companyRegion: companies.region,
      courseCode: courses.code,
      courseTitleEn: courses.titleEn,
      preferredRegion: trainingRequests.preferredRegion,
      preferredCity: trainingRequests.preferredCity,
      totalAmount: trainingRequests.totalAmount,
      candidates: sql<number>`(select count(*)::int from ${requestItems} where ${requestItems.requestId} = ${trainingRequests.id})`,
      createdAt: trainingRequests.createdAt,
    })
    .from(trainingRequests)
    .innerJoin(companies, eq(companies.id, trainingRequests.companyId))
    .innerJoin(courses, eq(courses.id, trainingRequests.courseId))
    .orderBy(desc(trainingRequests.createdAt))
    .limit(limit);
}

// Employee name but never their Iqama: an auditor confirms that a named
// person holds a valid certificate, which needs no identity number.
export async function listAuditCertificates(limit = 500) {
  return db
    .select({
      serial: certificates.serial,
      status: certificates.status,
      employeeName: employees.fullNameEn,
      companyName: companies.name,
      courseCode: courses.code,
      courseTitleEn: courses.titleEn,
      issuedAt: certificates.issuedAt,
      expiresAt: certificates.expiresAt,
      revokedReason: certificates.revokedReason,
    })
    .from(certificates)
    .innerJoin(employees, eq(employees.id, certificates.employeeId))
    .innerJoin(companies, eq(companies.id, certificates.companyId))
    .innerJoin(courses, eq(courses.id, certificates.courseId))
    .orderBy(desc(certificates.issuedAt))
    .limit(limit);
}

// The append-only trail of who changed what — the record an audit actually
// turns on. Filtered, paged and counted, because at several thousand users
// this table is the largest thing in the product and "the last 500 entries"
// is not an investigation, it is a sample.
//
// Actor resolved to a name so the export is readable without joining user
// ids by hand.
export interface ActivityFilters {
  actorUserId?: string | null;
  entityType?: string | null;
  action?: string | null;
  /** Inclusive date bounds, "YYYY-MM-DD" as they arrive from a date input. */
  from?: string | null;
  to?: string | null;
  q?: string | null;
  page?: number;
  pageSize?: number;
}

export const ACTIVITY_PAGE_SIZE = 100;

function activityWhere(filters: ActivityFilters) {
  const parts = [
    filters.actorUserId ? eq(auditLog.userId, filters.actorUserId) : undefined,
    filters.entityType ? eq(auditLog.entityType, filters.entityType) : undefined,
    filters.action ? eq(auditLog.action, filters.action) : undefined,
    filters.from ? gte(auditLog.createdAt, new Date(`${filters.from}T00:00:00Z`)) : undefined,
    // The "to" bound is inclusive of the whole day: an investigator picking
    // today and seeing nothing from today would reasonably call it broken.
    filters.to ? lte(auditLog.createdAt, new Date(`${filters.to}T23:59:59.999Z`)) : undefined,
    // Free text covers the note and the entity id, which is how somebody
    // arrives here holding a request number.
    filters.q?.trim()
      ? sql`(${auditLog.note} ilike ${`%${filters.q.trim()}%`} or ${auditLog.entityId}::text = ${filters.q.trim()})`
      : undefined,
  ].filter(Boolean);
  return parts.length > 0 ? and(...parts) : undefined;
}

export async function listAuditActivity(filters: ActivityFilters = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = filters.pageSize ?? ACTIVITY_PAGE_SIZE;
  const where = activityWhere(filters);

  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(auditLog).where(where);

  const rows = await db
    .select({
      id: auditLog.id,
      actor: profiles.fullName,
      actorRole: profiles.role,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      action: auditLog.action,
      fromStatus: auditLog.fromStatus,
      toStatus: auditLog.toStatus,
      note: auditLog.note,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .leftJoin(profiles, eq(profiles.userId, auditLog.userId))
    .where(where)
    // Tie-broken on id: without it, rows sharing a millisecond can repeat or
    // vanish across page boundaries, which in an audit trail is a hole.
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return { rows, total, page, pageSize };
}

// Every matching row, for the CSV. Separate and explicit so nobody renders
// the whole trail into a page by accident.
export async function listAuditActivityForExport(filters: ActivityFilters = {}) {
  return db
    .select({
      createdAt: auditLog.createdAt,
      actor: profiles.fullName,
      actorRole: profiles.role,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      action: auditLog.action,
      fromStatus: auditLog.fromStatus,
      toStatus: auditLog.toStatus,
      note: auditLog.note,
    })
    .from(auditLog)
    .leftJoin(profiles, eq(profiles.userId, auditLog.userId))
    .where(activityWhere(filters))
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id));
}

// What to offer in the filter dropdowns — derived from the log itself, so a
// verb added by a new feature appears without anyone maintaining a list.
export async function listActivityFilterOptions() {
  const entityTypes = await db
    .selectDistinct({ value: auditLog.entityType })
    .from(auditLog)
    .orderBy(auditLog.entityType);
  const actions = await db.selectDistinct({ value: auditLog.action }).from(auditLog).orderBy(auditLog.action);
  return { entityTypes: entityTypes.map((r) => r.value), actions: actions.map((r) => r.value) };
}
