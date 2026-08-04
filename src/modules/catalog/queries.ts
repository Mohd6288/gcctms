// catalog module — read-side queries (Drizzle, RLS-scoped via lib/supabase/server.ts).
import "server-only";
import { and, asc, count, eq, gte, inArray, sql } from "drizzle-orm";
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

// Cross-company/cross-region counts — super_admin only screen.
export async function getPlatformOverviewStats() {
  const [[companiesRow], [employeesRow], [activeClassesRow], [certificatesIssuedRow], [revenueRow]] = await Promise.all([
    db.select({ value: count() }).from(companies),
    db.select({ value: count() }).from(employees),
    db.select({ value: count() }).from(classes).where(eq(classes.status, "in_progress")),
    db.select({ value: count() }).from(certificates).where(eq(certificates.status, "issued")),
    db.select({ value: sql<string>`coalesce(sum(${payments.totalAmount}), 0)` }).from(payments).where(eq(payments.status, "verified")),
  ]);

  return {
    companies: companiesRow.value,
    employees: employeesRow.value,
    activeClasses: activeClassesRow.value,
    certificatesIssued: certificatesIssuedRow.value,
    revenue: revenueRow.value,
  };
}
