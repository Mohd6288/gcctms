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
  exams,
  jobRoles,
  payments,
  pricing,
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
// ALL groups must be satisfied. Group 1 = the course's own listed
// prerequisites, group 2 = the OHS induction — except for the induction
// courses themselves, which are where every employee starts.
export async function getPrerequisiteGroups(courseId: number): Promise<number[][]> {
  const listed = await listCoursePrerequisiteIds(courseId);
  const induction = await listOhsInductionCourseIds();

  const groups: number[][] = [];
  if (listed.size > 0) groups.push(Array.from(listed));
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

export async function listExams() {
  return db.select().from(exams).orderBy(asc(exams.code));
}

export async function listTrainingCenters() {
  return db.select().from(trainingCenters).orderBy(asc(trainingCenters.name));
}

export async function listTrainers() {
  return db
    .select({
      id: trainers.id,
      fullName: trainers.fullName,
      email: trainers.email,
      qualifications: trainers.qualifications,
      active: trainers.active,
      hasLogin: sql<boolean>`${trainers.userId} is not null`,
    })
    .from(trainers)
    .orderBy(asc(trainers.fullName));
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
