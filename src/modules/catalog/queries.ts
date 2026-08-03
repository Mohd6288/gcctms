// catalog module — read-side queries (Drizzle, RLS-scoped via lib/supabase/server.ts).
import "server-only";
import { asc, count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  certificates,
  classes,
  companies,
  courseJobRoles,
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
