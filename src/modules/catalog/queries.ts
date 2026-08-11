// catalog module — read-side queries (Drizzle, RLS-scoped via lib/supabase/server.ts).
import "server-only";
import { and, asc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  certificates,
  classes,
  companies,
  courseJobRoles,
  coursePrerequisites,
  cities,
  courses,
  documents,
  employees,
  jobRoles,
  payments,
  pricing,
  trainerCourses,
  trainers,
  trainingCenters,
} from "@/db/schema";

export async function listCourses() {
  return db
    .select({
      id: courses.id,
      code: courses.code,
      titleEn: courses.titleEn,
      titleAr: courses.titleAr,
      durationHours: courses.durationHours,
      minAttendancePct: courses.minAttendancePct,
      contractorCategory: courses.contractorCategory,
      active: courses.active,
    })
    .from(courses)
    .orderBy(asc(courses.code));
}

export async function getCourseById(courseId: number) {
  const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
  return course ?? null;
}

export async function listCourseJobRoleIds(courseId: number): Promise<Set<number>> {
  const rows = await db.select({ jobRoleId: courseJobRoles.jobRoleId }).from(courseJobRoles).where(eq(courseJobRoles.courseId, courseId));
  return new Set(rows.map((r) => r.jobRoleId));
}

export async function listCoursePrerequisiteIds(courseId: number): Promise<Set<number>> {
  const rows = await db
    .select({ prerequisiteCourseId: coursePrerequisites.prerequisiteCourseId })
    .from(coursePrerequisites)
    .where(eq(coursePrerequisites.courseId, courseId));
  return new Set(rows.map((r) => r.prerequisiteCourseId));
}

// The OHS General Induction. SEC's rule is that nobody trains at all without
// it, so it gates every other course — CSCC00, or CSCC09 (the same induction
// extended with office safety) for office-based roles, whichever the
// employee holds. The seeded catalog already names CSCC00 as a direct
// prerequisite for most courses, but not for those sitting behind a
// CSCC08/CSCC01/CSCC02 chain, and a course reached with an externally-earned
// mid-chain certificate would otherwise skip the induction entirely.
// Enforced here once for every course rather than by editing ~40
// course_prerequisites rows that would then drift from the source matrices.
const OHS_INDUCTION_CODES = ["CSCC00", "CSCC09"];

async function listOhsInductionCourseIds(): Promise<Set<number>> {
  const rows = await db.select({ id: courses.id }).from(courses).where(inArray(courses.code, OHS_INDUCTION_CODES));
  return new Set(rows.map((r) => r.id));
}

// Each group is OR-semantics internally (any one course in it satisfies it);
// ALL groups must be satisfied. The OHS induction is appended as its own
// group — except for the induction courses themselves, which are where every
// employee starts.
//
// Until 0039 every listed prerequisite went into ONE group, so a course could
// only ever say "hold any one of these". That is wrong for the technical
// certification tests, whose rule is that a technician holds FOUR named
// certificates: as a single group, Basic First Aid alone would have admitted
// them. course_prerequisites.group_no now carries the distinction, and rows
// predating 0039 all default to group 1 — so every existing course keeps
// exactly the behaviour it had.
//
// Grouping also expresses the codes that legitimately have two forms: Basic
// Fire Fighting is CSCC21, or CSCC24 for Transmission. Both sit in one group,
// so either satisfies it.
export async function getPrerequisiteGroups(courseId: number): Promise<number[][]> {
  const rows = await db
    .select({ prerequisiteCourseId: coursePrerequisites.prerequisiteCourseId, groupNo: coursePrerequisites.groupNo })
    .from(coursePrerequisites)
    .where(eq(coursePrerequisites.courseId, courseId))
    .orderBy(coursePrerequisites.groupNo);

  const byGroup = new Map<number, number[]>();
  for (const row of rows) {
    const group = byGroup.get(row.groupNo) ?? [];
    group.push(row.prerequisiteCourseId);
    byGroup.set(row.groupNo, group);
  }

  const groups = Array.from(byGroup.values());

  const induction = await listOhsInductionCourseIds();
  if (induction.size > 0 && !induction.has(courseId)) groups.push(Array.from(induction));
  return groups;
}

// A course is "held" by an employee via an internally-issued, non-expired
// certificate OR via an admin-verified external certificate the contractor
// filed (documents.type='prior_certificate' carrying a course link and its
// own expiry — 0027). Without the second half, an employee holding a real
// OHS card earned elsewhere could never pass the gate. Uploads that are
// still pending review, or were rejected, never count.
export async function employeesHoldingValidCertificate(employeeIds: number[], courseIds: number[]): Promise<Set<number>> {
  if (employeeIds.length === 0 || courseIds.length === 0) return new Set<number>();

  // Sequential, not Promise.all — concurrent Drizzle calls stall against the
  // pooler under load (see catalog/queries.ts's getPlatformOverviewStats).
  const issued = await db
    .select({ employeeId: certificates.employeeId })
    .from(certificates)
    .where(
      and(
        inArray(certificates.employeeId, employeeIds),
        inArray(certificates.courseId, courseIds),
        eq(certificates.status, "issued"),
        gte(certificates.expiresAt, new Date())
      )
    );

  const external = await db
    .select({ employeeId: documents.employeeId })
    .from(documents)
    .where(
      and(
        inArray(documents.employeeId, employeeIds),
        inArray(documents.courseId, courseIds),
        eq(documents.type, "prior_certificate"),
        isNotNull(documents.verifiedAt),
        gte(documents.expiresAt, new Date().toISOString().slice(0, 10))
      )
    );

  const holders = new Set(issued.map((r) => r.employeeId));
  for (const row of external) if (row.employeeId !== null) holders.add(row.employeeId);
  return holders;
}

// Bulk shape, used by the request-submission guard (requests/service.ts) and
// the wizard's advisory badges. Narrows the candidate set group by group, so
// an employee has to clear every group to survive.
export async function employeesSatisfyingPrerequisites(employeeIds: number[], courseId: number): Promise<Set<number>> {
  const groups = await getPrerequisiteGroups(courseId);
  let satisfied = new Set(employeeIds);
  for (const group of groups) {
    if (satisfied.size === 0) break;
    const holders = await employeesHoldingValidCertificate(Array.from(satisfied), group);
    satisfied = new Set(Array.from(satisfied).filter((id) => holders.has(id)));
  }
  return satisfied;
}

// Single-employee shape, used by the certificate eligibility gate
// (certification/service.ts).
export async function employeeSatisfiesPrerequisites(employeeId: number, courseId: number): Promise<boolean> {
  const satisfied = await employeesSatisfyingPrerequisites([employeeId], courseId);
  return satisfied.has(employeeId);
}

// Advisory-only snapshot for the request wizard's employee table (matches
// the validated prototype's Step2Employees.tsx badges exactly — never
// blocks adding an employee or submitting, just informs). One query for the
// role-restriction set, one for prerequisite ids, one for the employees'
// own job roles, then a per-employee prerequisite certificate check.
export interface EligibilityInfo {
  jobRoleEligible: boolean;
  hasRoleRestriction: boolean;
  missingPrerequisites: boolean;
  hasPrerequisiteRequirement: boolean;
  // Every course that would satisfy this course's gate — what the wizard
  // offers the contractor to file an existing certificate against.
  prerequisiteCourseIds: number[];
}

export async function getEmployeeEligibilitySnapshot(courseId: number, employeeIds: number[]) {
  if (employeeIds.length === 0) return new Map<number, EligibilityInfo>();

  // Sequential, not Promise.all: concurrent Drizzle calls stall against the
  // pooler under load and a mid-flight cancellation on a shared connection
  // surfaces as an uncatchable socket error (see getPlatformOverviewStats).
  const eligibleJobRoleIds = await listCourseJobRoleIds(courseId);
  const prerequisiteGroups = await getPrerequisiteGroups(courseId);
  const employeeRoles = await db
    .select({ id: employees.id, jobRoleId: employees.jobRoleId })
    .from(employees)
    .where(inArray(employees.id, employeeIds));

  const hasRoleRestriction = eligibleJobRoleIds.size > 0;
  const hasPrerequisiteRequirement = prerequisiteGroups.length > 0;
  const prerequisiteCourseIds = Array.from(new Set(prerequisiteGroups.flat()));

  const satisfiedIds = hasPrerequisiteRequirement
    ? await employeesSatisfyingPrerequisites(employeeIds, courseId)
    : new Set<number>();

  const result = new Map<number, EligibilityInfo>();
  for (const { id, jobRoleId } of employeeRoles) {
    result.set(id, {
      hasRoleRestriction,
      jobRoleEligible: !hasRoleRestriction || eligibleJobRoleIds.has(jobRoleId),
      hasPrerequisiteRequirement,
      missingPrerequisites: hasPrerequisiteRequirement && !satisfiedIds.has(id),
      prerequisiteCourseIds,
    });
  }
  return result;
}

export async function listAllJobRoles() {
  return db.select({ id: jobRoles.id, nameEn: jobRoles.nameEn, nameAr: jobRoles.nameAr }).from(jobRoles).orderBy(asc(jobRoles.nameEn));
}

// A landing page of totals tells you the platform exists; it doesn't tell
// you what is waiting on someone. These are the queues that block other
// people until an admin acts, in one round trip — ::int throughout because
// postgres.js returns bigint counts as strings.
export async function getAttentionCounts() {
  const [row] = await db.execute<{
    requests_to_review: number;
    payments_to_verify: number;
    documents_to_verify: number;
    certificates_to_approve: number;
    trainers_without_login: number;
    accounts_never_signed_in: number;
  }>(sql`
    select
      (select count(*)::int from training_requests where status = 'submitted') as requests_to_review,
      (select count(*)::int from payments where status = 'uploaded' and document_id is not null) as payments_to_verify,
      (select count(*)::int from documents
         where type in ('national_id', 'prior_certificate')
           and verified_at is null and rejected_at is null
           and (type = 'national_id' or course_id is not null)) as documents_to_verify,
      (select count(*)::int from certificates where status = 'pending_approval') as certificates_to_approve,
      (select count(*)::int from trainers where user_id is null and email is not null and active) as trainers_without_login,
      (select count(*)::int from profiles p
         where p.role <> 'contractor_manager'
           and not exists (select 1 from auth.users u where u.id = p.user_id and u.last_sign_in_at is not null)) as accounts_never_signed_in
  `);
  return row;
}

// Same idea as getAttentionCounts, scoped the way a platform_admin actually
// works: a region-assigned admin (0026) must not be shown another region's
// backlog, or they will either act on it or assume someone else has.
// region null means unassigned, which means the whole platform.
export async function getAdminAttentionCounts(region?: string | null) {
  const scoped = (companyAlias: string) => (region ? sql`and ${sql.raw(companyAlias)}.region = ${region}` : sql``);
  const [row] = await db.execute<{
    requests_to_review: number;
    payments_to_verify: number;
    documents_to_verify: number;
    certificates_to_approve: number;
    awaiting_scheduling: number;
    awaiting_quotation: number;
  }>(sql`
    select
      (select count(*)::int from training_requests tr join companies c on c.id = tr.company_id
        where tr.status = 'submitted' ${scoped("c")}) as requests_to_review,
      (select count(*)::int from payments p
         join training_requests tr on tr.id = p.request_id join companies c on c.id = tr.company_id
        where p.status = 'uploaded' and p.document_id is not null ${scoped("c")}) as payments_to_verify,
      (select count(*)::int from documents d join companies c on c.id = d.company_id
        where d.verified_at is null and d.rejected_at is null
          and (d.type = 'national_id' or (d.type = 'prior_certificate' and d.course_id is not null))
          ${scoped("c")}) as documents_to_verify,
      (select count(*)::int from certificates ct join companies c on c.id = ct.company_id
        where ct.status = 'pending_approval' ${scoped("c")}) as certificates_to_approve,
      (select count(*)::int from training_requests tr join companies c on c.id = tr.company_id
        where tr.status = 'ready_for_scheduling' ${scoped("c")}) as awaiting_scheduling,
      (select count(*)::int from training_requests tr join companies c on c.id = tr.company_id
        where tr.status = 'payment_pending' ${scoped("c")}
          and not exists (select 1 from documents d where d.request_id = tr.id and d.type = 'quotation')) as awaiting_quotation
  `);
  return row;
}

export async function getAdminOverviewStats(region?: string | null) {
  const scoped = region ? sql`where c.region = ${region}` : sql``;
  const [row] = await db.execute<{
    companies: number;
    employees: number;
    active_classes: number;
    certificates_this_month: number;
  }>(sql`
    select
      (select count(*)::int from companies c where c.status = 'active' ${region ? sql`and c.region = ${region}` : sql``}) as companies,
      (select count(*)::int from employees e join companies c on c.id = e.company_id ${scoped}) as employees,
      (select count(*)::int from classes cl where cl.status in ('scheduled', 'in_progress')
        ${region ? sql`and cl.region = ${region}` : sql``}) as active_classes,
      (select count(*)::int from certificates ct join companies c on c.id = ct.company_id
        where ct.status = 'issued' and ct.issued_at >= date_trunc('month', current_date)
        ${region ? sql`and c.region = ${region}` : sql``}) as certificates_this_month
  `);
  return row;
}

// Next classes on the board. "What is running soon" is the question an admin
// opens this page with, and it was the one thing the page could not answer.
export async function listUpcomingClasses(region?: string | null, limit = 5) {
  return db
    .select({
      id: classes.id,
      courseCode: courses.code,
      courseTitleEn: courses.titleEn,
      courseTitleAr: courses.titleAr,
      startDate: classes.startDate,
      endDate: classes.endDate,
      region: classes.region,
      capacity: classes.capacity,
      trainerName: trainers.fullName,
      enrolled: sql<number>`(select count(*)::int from class_enrollments ce
        where ce.class_id = ${classes.id} and ce.status = 'enrolled')`,
    })
    .from(classes)
    .innerJoin(courses, eq(classes.courseId, courses.id))
    .innerJoin(trainers, eq(classes.trainerId, trainers.id))
    .where(
      region
        ? and(inArray(classes.status, ["scheduled", "in_progress"]), eq(classes.region, region))
        : inArray(classes.status, ["scheduled", "in_progress"])
    )
    .orderBy(asc(classes.startDate))
    .limit(limit);
}

export async function getContractorOverviewStats(companyId: number) {
  const [row] = await db.execute<{
    employees: number;
    open_requests: number;
    upcoming_classes: number;
    valid_certificates: number;
  }>(sql`
    select
      (select count(*)::int from employees e where e.company_id = ${companyId} and e.status = 'active') as employees,
      (select count(*)::int from training_requests tr where tr.company_id = ${companyId}
        and tr.status not in ('completed', 'rejected')) as open_requests,
      (select count(distinct ce.class_id)::int from class_enrollments ce join classes cl on cl.id = ce.class_id
        where ce.company_id = ${companyId} and ce.status = 'enrolled' and cl.status in ('scheduled', 'in_progress')) as upcoming_classes,
      (select count(*)::int from certificates ct where ct.company_id = ${companyId} and ct.status = 'issued'
        and (ct.expires_at is null or ct.expires_at >= current_date)) as valid_certificates
  `);
  return row;
}

// The contractor's own upcoming classes, with how many of THEIR people are on
// each — the answer to "who of mine is going where, and when".
export async function listUpcomingClassesForCompany(companyId: number, limit = 5) {
  return db
    .select({
      id: classes.id,
      courseCode: courses.code,
      courseTitleEn: courses.titleEn,
      courseTitleAr: courses.titleAr,
      startDate: classes.startDate,
      endDate: classes.endDate,
      region: classes.region,
      attending: sql<number>`(select count(*)::int from class_enrollments ce
        where ce.class_id = ${classes.id} and ce.company_id = ${companyId} and ce.status = 'enrolled')`,
    })
    .from(classes)
    .innerJoin(courses, eq(classes.courseId, courses.id))
    .where(
      and(
        inArray(classes.status, ["scheduled", "in_progress"]),
        sql`exists (select 1 from class_enrollments ce where ce.class_id = ${classes.id}
          and ce.company_id = ${companyId} and ce.status = 'enrolled')`
      )
    )
    .orderBy(asc(classes.startDate))
    .limit(limit);
}

// The contractor's own queue: only things they can act on themselves. An
// item waiting on GCC Lab is deliberately absent — telling a contractor
// their request is "with the admin" invites them to chase it, not to do
// anything.
export async function getContractorAttentionCounts(companyId: number) {
  const [row] = await db.execute<{
    drafts: number;
    info_requested: number;
    payment_due: number;
    rejected_documents: number;
    employees_without_iqama: number;
    certificates_expiring: number;
  }>(sql`
    select
      (select count(*)::int from training_requests where company_id = ${companyId} and status = 'draft') as drafts,
      (select count(*)::int from training_requests where company_id = ${companyId} and status = 'info_requested') as info_requested,
      (select count(*)::int from training_requests where company_id = ${companyId} and status = 'payment_pending') as payment_due,
      (select count(*)::int from documents where company_id = ${companyId} and rejected_at is not null) as rejected_documents,
      (select count(*)::int from employees e where e.company_id = ${companyId} and e.status = 'active'
         and not exists (select 1 from documents d where d.employee_id = e.id and d.type = 'national_id')) as employees_without_iqama,
      (select count(*)::int from certificates where company_id = ${companyId} and status = 'issued'
         and expires_at is not null and expires_at between now() and now() + interval '90 days') as certificates_expiring
  `);
  return row;
}

export async function listCities() {
  return db
    .select({ name: cities.name, region: cities.region, nameAr: cities.nameAr, active: cities.active })
    .from(cities)
    .orderBy(asc(cities.region), asc(cities.name));
}

// Only active ones reach the request wizard: a deactivated city keeps its
// historical requests intact (the FK is ON DELETE RESTRICT) but must not be
// offered for new ones.
export async function listActiveCities() {
  return db
    .select({ name: cities.name, region: cities.region, nameAr: cities.nameAr })
    .from(cities)
    .where(eq(cities.active, true))
    .orderBy(asc(cities.region), asc(cities.name));
}

export async function listPricingForCourse(courseId: number) {
  return db
    .select({
      id: pricing.id,
      region: pricing.region,
      price: pricing.price,
      effectiveFrom: pricing.effectiveFrom,
      effectiveTo: pricing.effectiveTo,
    })
    .from(pricing)
    .where(eq(pricing.courseId, courseId))
    .orderBy(asc(pricing.effectiveFrom));
}

export async function listTrainingCenters() {
  return db.select().from(trainingCenters).orderBy(asc(trainingCenters.name));
}

export async function listTrainers() {
  return db
    .select({
      id: trainers.id,
      // Needed by the super admin's password/MFA recovery controls — a
      // trainer locked out of their authenticator has no other way back.
      userId: trainers.userId,
      fullName: trainers.fullName,
      email: trainers.email,
      phone: trainers.phone,
      qualifications: trainers.qualifications,
      active: trainers.active,
      hasLogin: sql<boolean>`${trainers.userId} is not null`,
      // ::int, not a bare count — postgres.js hands bigint back as a string
      // and sql<number> would not have caught it.
      courseCount: sql<number>`(select count(*)::int from trainer_courses tc where tc.trainer_id = ${trainers.id})`,
      lastSignInAt: sql<Date | null>`(select u.last_sign_in_at from auth.users u where u.id = ${trainers.userId})`,
    })
    .from(trainers)
    .orderBy(asc(trainers.fullName));
}

// Trainer -> the courses they are certified to deliver. Flat rows for the
// caller to group, not a json_agg: an aggregate comes back from postgres.js
// as a string and sql<Course[]> would cheerfully assert otherwise (same trap
// as the ::int above). Sorted by trainer then code so grouping is stable.
export async function listTrainerCourses() {
  return db
    .select({
      trainerId: trainerCourses.trainerId,
      courseId: courses.id,
      code: courses.code,
      titleEn: courses.titleEn,
      titleAr: courses.titleAr,
      contractorCategory: courses.contractorCategory,
    })
    .from(trainerCourses)
    .innerJoin(courses, eq(courses.id, trainerCourses.courseId))
    .orderBy(asc(trainerCourses.trainerId), asc(courses.code));
}

// Cross-company/cross-region counts — super_admin only screen. One round trip
// (not 5 concurrent queries) — Promise.all-ing separate queries here used to
// starve the pool under load and, worse, a mid-flight statement_timeout
// cancellation on a shared connection surfaced as a raw socket-level error
// that no per-query .catch() could intercept, crashing the whole instance.
export async function getPlatformOverviewStats() {
  const [row] = await db.execute<{
    companies: number;
    employees: number;
    active_classes: number;
    certificates_issued: number;
    revenue: string;
  }>(sql`
    select
      (select count(*)::int from ${companies}) as companies,
      (select count(*)::int from ${employees}) as employees,
      (select count(*)::int from ${classes} where ${classes.status} = 'in_progress') as active_classes,
      (select count(*)::int from ${certificates} where ${certificates.status} = 'issued') as certificates_issued,
      (select coalesce(sum(${payments.totalAmount}), 0) from ${payments} where ${payments.status} = 'verified') as revenue
  `);

  return {
    companies: row.companies,
    employees: row.employees,
    activeClasses: row.active_classes,
    certificatesIssued: row.certificates_issued,
    revenue: row.revenue,
  };
}
