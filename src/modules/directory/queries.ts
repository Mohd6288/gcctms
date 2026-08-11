// directory — read-only profiles, progress and per-entity history.
//
// Same masking rule as audit/queries.ts: every query names its columns, and
// national_id_enc leaves this module only through maskNationalId(). A profile
// shows the last four digits so a person can be matched against a paper
// record; the full Iqama still exists in exactly one place, printed on the
// certificate PDF.
//
// Callers must run assertCanViewCompany() first — Drizzle bypasses RLS, and
// an auditor has no policies at all (0033), so these functions are trusted
// server paths with no scoping of their own.
import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  auditLog,
  certificates,
  classEnrollments,
  classes,
  companies,
  courses,
  manufacturers,
  qualificationCards,
  documents,
  employees,
  jobRoles,
  profiles,
  requestItems,
  trainingRequests,
} from "@/db/schema";
import { hashNationalId, maskNationalId } from "@/modules/platform/security/national-id";

// Certificates falling due inside this window are the ones worth chasing —
// long enough to book a class and run it, short enough to still be news.
//
// Always cast it at the call site: a bound parameter reaches Postgres
// untyped, and `current_date + $1` is then ambiguous between date+int and
// date+interval ("operator is not unique: date + unknown").
const EXPIRING_SOON_DAYS = 60;

export async function getEmployeeProfile(employeeId: number) {
  const [employee] = await db
    .select({
      id: employees.id,
      companyId: employees.companyId,
      companyName: companies.name,
      companyRegion: companies.region,
      fullNameEn: employees.fullNameEn,
      fullNameAr: employees.fullNameAr,
      nationalIdEnc: employees.nationalIdEnc,
      jobRoleName: jobRoles.nameEn,
      nationality: employees.nationality,
      phone: employees.phone,
      email: employees.email,
      status: employees.status,
      createdAt: employees.createdAt,
    })
    .from(employees)
    .innerJoin(companies, eq(companies.id, employees.companyId))
    .leftJoin(jobRoles, eq(jobRoles.id, employees.jobRoleId))
    .where(eq(employees.id, employeeId));
  if (!employee) return null;

  const { nationalIdEnc, ...rest } = employee;
  return { ...rest, nationalIdMasked: maskNationalId(nationalIdEnc) };
}

// Whether identity was checked, and by whom — never the file itself.
export async function getEmployeeIdentityStatus(employeeId: number) {
  const [doc] = await db
    .select({
      id: documents.id,
      verifiedAt: documents.verifiedAt,
      rejectedAt: documents.rejectedAt,
      rejectionReason: documents.rejectionReason,
      verifierName: sql<string | null>`(select p.full_name from profiles p where p.user_id = ${documents.verifiedBy})`,
    })
    .from(documents)
    .where(and(eq(documents.employeeId, employeeId), eq(documents.type, "national_id")))
    .orderBy(desc(documents.id))
    .limit(1);
  return doc ?? null;
}

export async function listEmployeeCertificates(employeeId: number) {
  return db
    .select({
      id: certificates.id,
      serial: certificates.serial,
      status: certificates.status,
      courseCode: courses.code,
      courseTitleEn: courses.titleEn,
      courseTitleAr: courses.titleAr,
      issuedAt: certificates.issuedAt,
      expiresAt: certificates.expiresAt,
      revokedReason: certificates.revokedReason,
    })
    .from(certificates)
    .innerJoin(courses, eq(courses.id, certificates.courseId))
    .where(eq(certificates.employeeId, employeeId))
    .orderBy(desc(certificates.issuedAt));
}

/**
 * The manufacturer-issued cards this technician holds.
 *
 * Listed separately from certificates rather than merged into them. An auditor
 * asking "what does this person hold" needs both, but conflating them would
 * imply GCC Lab stands behind a card it did not print — and the two answer
 * different questions at a site gate.
 */
export async function listEmployeeCards(employeeId: number) {
  return db
    .select({
      id: qualificationCards.id,
      cardNumber: qualificationCards.cardNumber,
      status: qualificationCards.status,
      issuanceType: qualificationCards.issuanceType,
      courseCode: courses.code,
      courseTitleEn: courses.titleEn,
      courseTitleAr: courses.titleAr,
      testDate: qualificationCards.testDate,
      expiresAt: qualificationCards.expiresAt,
      collectedAt: qualificationCards.collectedAt,
      collectedByName: qualificationCards.collectedByName,
      manufacturerName: manufacturers.name,
    })
    .from(qualificationCards)
    .innerJoin(courses, eq(courses.id, qualificationCards.courseId))
    .leftJoin(manufacturers, eq(manufacturers.id, qualificationCards.manufacturerId))
    .where(eq(qualificationCards.employeeId, employeeId))
    .orderBy(desc(qualificationCards.testDate));
}

// Where they are in training right now: the classes they sit in, with the
// attendance and exam outcome the certificate gate reads.
export async function listEmployeeTraining(employeeId: number) {
  return db
    .select({
      enrollmentId: classEnrollments.id,
      classId: classes.id,
      courseCode: courses.code,
      courseTitleEn: courses.titleEn,
      courseTitleAr: courses.titleAr,
      startDate: classes.startDate,
      endDate: classes.endDate,
      region: classes.region,
      classStatus: classes.status,
      enrollmentStatus: classEnrollments.status,
      attendancePct: classEnrollments.attendancePct,
      // ::int, not a bare count — postgres.js returns bigint as a string and
      // sql<number> would not have caught it.
      examScore: sql<number | null>`(select er.score::int from exam_results er
        where er.enrollment_id = ${classEnrollments.id} order by er.attempt_no desc limit 1)`,
      examResult: sql<string | null>`(select er.result from exam_results er
        where er.enrollment_id = ${classEnrollments.id} order by er.attempt_no desc limit 1)`,
    })
    .from(classEnrollments)
    .innerJoin(classes, eq(classes.id, classEnrollments.classId))
    .innerJoin(courses, eq(courses.id, classes.courseId))
    .where(eq(classEnrollments.employeeId, employeeId))
    .orderBy(desc(classes.startDate));
}

export async function getEmployeeProgress(employeeId: number) {
  const [row] = await db.execute<{
    valid: number;
    expiring_soon: number;
    expired: number;
    revoked: number;
    classes_upcoming: number;
    cards_valid: number;
    cards_expiring_soon: number;
    cards_expired: number;
  }>(sql`
    select
      (select count(*)::int from certificates c
        where c.employee_id = ${employeeId} and c.status = 'issued'
          and (c.expires_at is null or c.expires_at >= current_date)) as valid,
      (select count(*)::int from certificates c
        where c.employee_id = ${employeeId} and c.status = 'issued'
          and c.expires_at between current_date and current_date + ${EXPIRING_SOON_DAYS}::int) as expiring_soon,
      (select count(*)::int from certificates c
        where c.employee_id = ${employeeId} and c.status = 'issued'
          and c.expires_at is not null and c.expires_at < current_date) as expired,
      (select count(*)::int from certificates c
        where c.employee_id = ${employeeId} and c.status = 'revoked') as revoked,
      (select count(*)::int from class_enrollments ce join classes cl on cl.id = ce.class_id
        where ce.employee_id = ${employeeId} and ce.status = 'enrolled'
          and cl.status in ('scheduled', 'in_progress')) as classes_upcoming,
      -- Counted alongside certificates, not instead of them. A cable
      -- technician holds cards and no certificates for that work, and a
      -- progress card that only counted certificates would show them as
      -- holding nothing at all.
      (select count(*)::int from qualification_cards qc
        where qc.employee_id = ${employeeId} and qc.status in ('issued', 'collected')
          and (qc.expires_at is null or qc.expires_at >= current_date)) as cards_valid,
      (select count(*)::int from qualification_cards qc
        where qc.employee_id = ${employeeId} and qc.status in ('issued', 'collected')
          and qc.expires_at between current_date and current_date + ${EXPIRING_SOON_DAYS}::int) as cards_expiring_soon,
      (select count(*)::int from qualification_cards qc
        where qc.employee_id = ${employeeId} and qc.status in ('issued', 'collected')
          and qc.expires_at is not null and qc.expires_at < current_date) as cards_expired
  `);
  return row;
}

export async function getCompanyProfile(companyId: number) {
  const [company] = await db
    .select({
      id: companies.id,
      name: companies.name,
      crNumber: companies.crNumber,
      contactName: companies.contactName,
      contactEmail: companies.contactEmail,
      contactPhone: companies.contactPhone,
      region: companies.region,
      city: companies.city,
      status: companies.status,
      createdAt: companies.createdAt,
    })
    .from(companies)
    .where(eq(companies.id, companyId));
  return company ?? null;
}

export async function getCompanyProgress(companyId: number) {
  const [row] = await db.execute<{
    employees: number;
    open_requests: number;
    certificates_valid: number;
    certificates_expiring: number;
  }>(sql`
    select
      (select count(*)::int from employees e where e.company_id = ${companyId} and e.status = 'active') as employees,
      (select count(*)::int from training_requests tr where tr.company_id = ${companyId}
        and tr.status not in ('completed', 'rejected')) as open_requests,
      (select count(*)::int from certificates c where c.company_id = ${companyId} and c.status = 'issued'
        and (c.expires_at is null or c.expires_at >= current_date)) as certificates_valid,
      (select count(*)::int from certificates c where c.company_id = ${companyId} and c.status = 'issued'
        and c.expires_at between current_date and current_date + ${EXPIRING_SOON_DAYS}::int) as certificates_expiring
  `);
  return row;
}

// The company's people, each with the one number that matters on a roster —
// how many valid certificates they hold — so a gap is visible without opening
// every profile.
export async function listCompanyRoster(companyId: number) {
  return db
    .select({
      id: employees.id,
      fullNameEn: employees.fullNameEn,
      fullNameAr: employees.fullNameAr,
      nationalIdEnc: employees.nationalIdEnc,
      jobRoleName: jobRoles.nameEn,
      status: employees.status,
      validCertificates: sql<number>`(select count(*)::int from certificates c
        where c.employee_id = ${employees.id} and c.status = 'issued'
          and (c.expires_at is null or c.expires_at >= current_date))`,
      iqamaVerified: sql<boolean>`exists (select 1 from documents d
        where d.employee_id = ${employees.id} and d.type = 'national_id' and d.verified_at is not null)`,
    })
    .from(employees)
    .leftJoin(jobRoles, eq(jobRoles.id, employees.jobRoleId))
    .where(eq(employees.companyId, companyId))
    .orderBy(employees.fullNameEn)
    .then((rows) => rows.map(({ nationalIdEnc, ...rest }) => ({ ...rest, nationalIdMasked: maskNationalId(nationalIdEnc) })));
}

export async function listCompanyRequests(companyId: number, limit = 50) {
  return db
    .select({
      id: trainingRequests.id,
      status: trainingRequests.status,
      courseCode: courses.code,
      courseTitleEn: courses.titleEn,
      candidates: sql<number>`(select count(*)::int from ${requestItems} where ${requestItems.requestId} = ${trainingRequests.id})`,
      totalAmount: trainingRequests.totalAmount,
      createdAt: trainingRequests.createdAt,
    })
    .from(trainingRequests)
    .innerJoin(courses, eq(courses.id, trainingRequests.courseId))
    .where(eq(trainingRequests.companyId, companyId))
    .orderBy(desc(trainingRequests.createdAt))
    .limit(limit);
}

// A staff account: who they are, and what they have actually done.
export async function getAccountProfile(userId: string) {
  const [account] = await db
    .select({
      userId: profiles.userId,
      fullName: profiles.fullName,
      role: profiles.role,
      active: profiles.active,
      companyId: profiles.companyId,
      trainerId: profiles.trainerId,
      createdAt: profiles.createdAt,
      email: sql<string | null>`(select u.email from auth.users u where u.id = ${profiles.userId})`,
      lastSignInAt: sql<Date | null>`(select u.last_sign_in_at from auth.users u where u.id = ${profiles.userId})`,
      mfaFactors: sql<number>`(select count(*)::int from auth.mfa_factors f where f.user_id = ${profiles.userId} and f.status = 'verified')`,
      region: sql<string | null>`(select raa.region from regional_admin_assignments raa where raa.admin_user_id = ${profiles.userId})`,
      actionsTaken: sql<number>`(select count(*)::int from audit_log al where al.user_id = ${profiles.userId})`,
    })
    .from(profiles)
    .where(eq(profiles.userId, userId));
  return account ?? null;
}

export async function listStaffAccounts() {
  return db
    .select({
      userId: profiles.userId,
      fullName: profiles.fullName,
      role: profiles.role,
      active: profiles.active,
      email: sql<string | null>`(select u.email from auth.users u where u.id = ${profiles.userId})`,
      lastSignInAt: sql<Date | null>`(select u.last_sign_in_at from auth.users u where u.id = ${profiles.userId})`,
      region: sql<string | null>`(select raa.region from regional_admin_assignments raa where raa.admin_user_id = ${profiles.userId})`,
      actionsTaken: sql<number>`(select count(*)::int from audit_log al where al.user_id = ${profiles.userId})`,
    })
    .from(profiles)
    .orderBy(
      sql`case ${profiles.role} when 'super_admin' then 0 when 'platform_admin' then 1 when 'auditor' then 2 when 'trainer' then 3 else 4 end`,
      profiles.fullName
    );
}

// What one person has done, newest first — the actor view of the same trail
// getEntityHistory reads by subject.
export async function listAccountActivity(userId: string, limit = 100) {
  return db
    .select({
      id: auditLog.id,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      action: auditLog.action,
      fromStatus: auditLog.fromStatus,
      toStatus: auditLog.toStatus,
      note: auditLog.note,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .where(eq(auditLog.userId, userId))
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(limit);
}

// The per-entity read of audit_log the schema has been indexed for since
// Phase 1 (audit_log_entity_idx) and that nothing used: until now the only
// way to ask "what happened to this request" was to scroll the whole feed.
export async function getEntityHistory(entityType: string, entityId: number, limit = 100) {
  return db
    .select({
      id: auditLog.id,
      actor: profiles.fullName,
      actorRole: profiles.role,
      action: auditLog.action,
      fromStatus: auditLog.fromStatus,
      toStatus: auditLog.toStatus,
      note: auditLog.note,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .leftJoin(profiles, eq(profiles.userId, auditLog.userId))
    .where(and(eq(auditLog.entityType, entityType), eq(auditLog.entityId, entityId)))
    // id breaks the tie: several audit rows routinely land in the same
    // millisecond (approve writes two), and ordering on the timestamp alone
    // left their order to the planner.
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(limit);
}

// Paged and searchable, because 3,000 people do not fit on a screen or in a
// single RSC payload.
//
// The old version took `limit 1000` and said nothing about the rest, so an
// auditor looking at 3,000 employees saw 1,000 and had no way to know. A cap
// that lies is worse than a slow page: it looks complete.
export interface DirectoryPage<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const DIRECTORY_PAGE_SIZE = 50;

function employeeSearch(q?: string | null) {
  const term = q?.trim();
  if (!term) return undefined;
  const needle = `%${term}%`;

  // A full Iqama matches exactly, without the number ever being stored or
  // shown: national_id_hash is a deterministic HMAC, so hashing what was
  // typed and comparing is the same lookup the uniqueness constraint uses.
  // This is the investigator's real question — "who is 2401239876?" — and it
  // is answerable here without weakening the masking anywhere else.
  const looksLikeIqama = /^\d{8,}$/.test(term);

  return looksLikeIqama
    ? sql`(${employees.fullNameEn} ilike ${needle}
        or ${employees.fullNameAr} ilike ${needle}
        or ${companies.name} ilike ${needle}
        or ${employees.nationalIdHash} = ${hashNationalId(term)})`
    : sql`(${employees.fullNameEn} ilike ${needle}
        or ${employees.fullNameAr} ilike ${needle}
        or ${companies.name} ilike ${needle})`;
}

export async function listDirectoryEmployees(options: {
  region?: string | null;
  q?: string | null;
  page?: number;
  pageSize?: number;
} = {}): Promise<DirectoryPage<{
  id: number;
  fullNameEn: string;
  fullNameAr: string;
  nationalIdMasked: string | null;
  companyId: number;
  companyName: string;
  companyRegion: string | null;
  jobRoleName: string | null;
  status: string;
  validCertificates: number;
}>> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = options.pageSize ?? DIRECTORY_PAGE_SIZE;
  const filters = [options.region ? eq(companies.region, options.region) : undefined, employeeSearch(options.q)].filter(Boolean);
  const where = filters.length > 0 ? and(...filters) : undefined;

  // Count first so the page can say "showing 50 of 3,000" rather than imply
  // the list is everything.
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(employees)
    .innerJoin(companies, eq(companies.id, employees.companyId))
    .where(where);

  const rows = await db
    .select({
      id: employees.id,
      fullNameEn: employees.fullNameEn,
      fullNameAr: employees.fullNameAr,
      nationalIdEnc: employees.nationalIdEnc,
      companyId: companies.id,
      companyName: companies.name,
      companyRegion: companies.region,
      jobRoleName: jobRoles.nameEn,
      status: employees.status,
      validCertificates: sql<number>`(select count(*)::int from certificates c
        where c.employee_id = ${employees.id} and c.status = 'issued'
          and (c.expires_at is null or c.expires_at >= current_date))`,
    })
    .from(employees)
    .innerJoin(companies, eq(companies.id, employees.companyId))
    .leftJoin(jobRoles, eq(jobRoles.id, employees.jobRoleId))
    .where(where)
    .orderBy(companies.name, employees.fullNameEn)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return {
    rows: rows.map(({ nationalIdEnc, ...rest }) => ({ ...rest, nationalIdMasked: maskNationalId(nationalIdEnc) })),
    total,
    page,
    pageSize,
  };
}

// The same rows without paging, for the CSV export. Kept separate and
// explicit so nobody accidentally renders 3,000 rows into a page: this one
// exists to be streamed to a file, never to a screen.
export async function listAllDirectoryEmployeesForExport(options: { region?: string | null; q?: string | null } = {}) {
  const filters = [options.region ? eq(companies.region, options.region) : undefined, employeeSearch(options.q)].filter(Boolean);
  const rows = await db
    .select({
      fullNameEn: employees.fullNameEn,
      fullNameAr: employees.fullNameAr,
      nationalIdEnc: employees.nationalIdEnc,
      companyName: companies.name,
      companyRegion: companies.region,
      jobRoleName: jobRoles.nameEn,
      status: employees.status,
      validCertificates: sql<number>`(select count(*)::int from certificates c
        where c.employee_id = ${employees.id} and c.status = 'issued'
          and (c.expires_at is null or c.expires_at >= current_date))`,
    })
    .from(employees)
    .innerJoin(companies, eq(companies.id, employees.companyId))
    .leftJoin(jobRoles, eq(jobRoles.id, employees.jobRoleId))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(companies.name, employees.fullNameEn);
  return rows.map(({ nationalIdEnc, ...rest }) => ({ ...rest, nationalIdMasked: maskNationalId(nationalIdEnc) }));
}

export async function listDirectoryCompanies(region?: string | null) {
  return db
    .select({
      id: companies.id,
      name: companies.name,
      crNumber: companies.crNumber,
      region: companies.region,
      city: companies.city,
      status: companies.status,
      contactName: companies.contactName,
      contactEmail: companies.contactEmail,
      employees: sql<number>`(select count(*)::int from employees e where e.company_id = ${companies.id})`,
      validCertificates: sql<number>`(select count(*)::int from certificates c
        where c.company_id = ${companies.id} and c.status = 'issued'
          and (c.expires_at is null or c.expires_at >= current_date))`,
    })
    .from(companies)
    .where(region ? eq(companies.region, region) : undefined)
    .orderBy(companies.name);
}
