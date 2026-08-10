// audit module — read-only, platform-wide views for the auditor portal.
//
// Every query here names its columns explicitly and never selects
// employees.national_id_enc / national_id_hash. That is the masking
// decision, and it lives here rather than in a policy because RLS is
// row-level: it can withhold a row but not a column. Auditors have no RLS
// policies at all (0033), so this module is the only path to the data.
import "server-only";
import { desc, eq, sql } from "drizzle-orm";
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
// turns on. Actor resolved to a name so the export is readable without
// joining user ids by hand.
export async function listAuditActivity(limit = 500) {
  return db
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
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}
