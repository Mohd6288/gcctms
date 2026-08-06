// catalog module — read-side queries (Drizzle, RLS-scoped via lib/supabase/server.ts).
import "server-only";
import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  certificates,
  classes,
  companies,
  courseJobRoles,
  coursePrerequisites,
  courses,
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

// OR-semantics: satisfied if the employee holds a valid (issued,
// non-expired) certificate for ANY ONE listed prerequisite. Used by both
// the request-submission guard (bulk, see requests/service.ts) and the
// certificate eligibility gate (single-employee, see
// certification/service.ts) — this is the single-employee shape.
export async function employeeSatisfiesPrerequisites(employeeId: number, courseId: number): Promise<boolean> {
  const prerequisiteCourseIds = await listCoursePrerequisiteIds(courseId);
  if (prerequisiteCourseIds.size === 0) return true;

  const [valid] = await db
    .select({ id: certificates.id })
    .from(certificates)
    .where(
      and(
        eq(certificates.employeeId, employeeId),
        inArray(certificates.courseId, Array.from(prerequisiteCourseIds)),
        eq(certificates.status, "issued"),
        gte(certificates.expiresAt, new Date())
      )
    )
    .limit(1);
  return Boolean(valid);
}

// Advisory-only snapshot for the request wizard's employee table (matches
// the validated prototype's Step2Employees.tsx badges exactly — never
// blocks adding an employee or submitting, just informs). One query for the
// role-restriction set, one for prerequisite ids, one for the employees'
// own job roles, then a per-employee prerequisite certificate check.
export async function getEmployeeEligibilitySnapshot(courseId: number, employeeIds: number[]) {
  if (employeeIds.length === 0) return new Map<number, { jobRoleEligible: boolean; hasRoleRestriction: boolean; missingPrerequisites: boolean; hasPrerequisiteRequirement: boolean }>();

  const [eligibleJobRoleIds, prerequisiteCourseIds, employeeRoles] = await Promise.all([
    listCourseJobRoleIds(courseId),
    listCoursePrerequisiteIds(courseId),
    db.select({ id: employees.id, jobRoleId: employees.jobRoleId }).from(employees).where(inArray(employees.id, employeeIds)),
  ]);

  const hasRoleRestriction = eligibleJobRoleIds.size > 0;
  const hasPrerequisiteRequirement = prerequisiteCourseIds.size > 0;

  const satisfiedIds = hasPrerequisiteRequirement
    ? new Set(
        (
          await db
            .select({ employeeId: certificates.employeeId })
            .from(certificates)
            .where(
              and(
                inArray(certificates.employeeId, employeeIds),
                inArray(certificates.courseId, Array.from(prerequisiteCourseIds)),
                eq(certificates.status, "issued"),
                gte(certificates.expiresAt, new Date())
              )
            )
        ).map((r) => r.employeeId)
      )
    : new Set<number>();

  const result = new Map<number, { jobRoleEligible: boolean; hasRoleRestriction: boolean; missingPrerequisites: boolean; hasPrerequisiteRequirement: boolean }>();
  for (const { id, jobRoleId } of employeeRoles) {
    result.set(id, {
      hasRoleRestriction,
      jobRoleEligible: !hasRoleRestriction || eligibleJobRoleIds.has(jobRoleId),
      hasPrerequisiteRequirement,
      missingPrerequisites: hasPrerequisiteRequirement && !satisfiedIds.has(id),
    });
  }
  return result;
}

export async function listAllJobRoles() {
  return db.select({ id: jobRoles.id, nameEn: jobRoles.nameEn, nameAr: jobRoles.nameAr }).from(jobRoles).orderBy(asc(jobRoles.nameEn));
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
      qualifications: trainers.qualifications,
      active: trainers.active,
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
