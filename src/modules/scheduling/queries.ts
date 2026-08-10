// scheduling module — read-side queries (Drizzle, RLS-scoped via lib/supabase/server.ts).
import "server-only";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  classEnrollments,
  classes,
  companies,
  courses,
  employees,
  profiles,
  regionalAdminAssignments,
  requestItems,
  trainers,
  trainingCenters,
  trainingRequests,
} from "@/db/schema";

// Billable (decision != rejected) request items whose parent request is
// ready_for_scheduling — candidates for the scheduling board pool. Filter
// out ids present in listActiveEnrollmentRequestItemIds() to get the actual
// pool (still unassigned to any non-cancelled class); group the remainder
// by assignedRegion (null = unassigned pool) in the caller.
export async function listSchedulableRequestItems() {
  return db
    .select({
      requestItemId: requestItems.id,
      requestId: requestItems.requestId,
      employeeId: requestItems.employeeId,
      employeeFullNameEn: employees.fullNameEn,
      employeeFullNameAr: employees.fullNameAr,
      companyId: employees.companyId,
      companyName: companies.name,
      courseId: requestItems.courseId,
      assignedRegion: requestItems.assignedRegion,
      preferredRegion: trainingRequests.preferredRegion,
    })
    .from(requestItems)
    .innerJoin(trainingRequests, eq(requestItems.requestId, trainingRequests.id))
    .innerJoin(employees, eq(requestItems.employeeId, employees.id))
    .innerJoin(companies, eq(employees.companyId, companies.id))
    .where(and(ne(requestItems.decision, "rejected"), eq(trainingRequests.status, "ready_for_scheduling")));
}

export async function listActiveEnrollmentRequestItemIds(): Promise<Set<number>> {
  const rows = await db
    .select({ requestItemId: classEnrollments.requestItemId })
    .from(classEnrollments)
    .innerJoin(classes, eq(classEnrollments.classId, classes.id))
    .where(ne(classes.status, "cancelled"));
  return new Set(rows.map((r) => r.requestItemId));
}

export async function listRegionalAdminAssignments() {
  return db.select().from(regionalAdminAssignments);
}

export async function listPlatformAdmins() {
  return db
    .select({ userId: profiles.userId, fullName: profiles.fullName })
    .from(profiles)
    .where(and(eq(profiles.role, "platform_admin"), eq(profiles.active, true)))
    .orderBy(asc(profiles.fullName));
}

// region: Drizzle bypasses RLS, so a region-assigned platform_admin
// (Phase 5) needs this filter applied explicitly here too — see
// companies/queries.ts's listCompanies() for the same note. classes.region
// is the class's own delivery region, no join needed.
export async function listClasses(region?: string | null) {
  return db
    .select({
      id: classes.id,
      courseId: classes.courseId,
      courseCode: courses.code,
      courseTitleEn: courses.titleEn,
      courseTitleAr: courses.titleAr,
      // Drives the end-date auto-fill when an admin moves the start date.
      courseDurationHours: courses.durationHours,
      trainerId: classes.trainerId,
      trainerFullName: trainers.fullName,
      region: classes.region,
      type: classes.type,
      startDate: classes.startDate,
      endDate: classes.endDate,
      capacity: classes.capacity,
      status: classes.status,
    })
    .from(classes)
    .innerJoin(courses, eq(classes.courseId, courses.id))
    .innerJoin(trainers, eq(classes.trainerId, trainers.id))
    .where(region ? eq(classes.region, region) : undefined)
    .orderBy(asc(classes.startDate));
}

export async function getClassById(classId: number) {
  const [cls] = await db
    .select({
      id: classes.id,
      courseId: classes.courseId,
      courseCode: courses.code,
      courseTitleEn: courses.titleEn,
      courseTitleAr: courses.titleAr,
      // Drives the end-date auto-fill when an admin moves the start date.
      courseDurationHours: courses.durationHours,
      trainerId: classes.trainerId,
      trainerFullName: trainers.fullName,
      centerId: classes.centerId,
      region: classes.region,
      type: classes.type,
      companyId: classes.companyId,
      startDate: classes.startDate,
      endDate: classes.endDate,
      capacity: classes.capacity,
      status: classes.status,
    })
    .from(classes)
    .innerJoin(courses, eq(classes.courseId, courses.id))
    .innerJoin(trainers, eq(classes.trainerId, trainers.id))
    .where(eq(classes.id, classId));
  return cls ?? null;
}

export async function listEnrollmentsForClass(classId: number) {
  return db
    .select({
      id: classEnrollments.id,
      requestItemId: classEnrollments.requestItemId,
      employeeId: classEnrollments.employeeId,
      employeeFullNameEn: employees.fullNameEn,
      employeeFullNameAr: employees.fullNameAr,
      companyId: classEnrollments.companyId,
      companyName: companies.name,
      status: classEnrollments.status,
    })
    .from(classEnrollments)
    .innerJoin(employees, eq(classEnrollments.employeeId, employees.id))
    .innerJoin(companies, eq(classEnrollments.companyId, companies.id))
    .where(eq(classEnrollments.classId, classId))
    .orderBy(asc(classEnrollments.createdAt));
}

// Every class this company's employees sit in, one row per employee — the
// contractor's "My Training" view groups them by class. Scoped by
// class_enrollments.company_id, which is denormalised onto the enrollment
// precisely so this doesn't need to walk back through request_items.
//
// Cancelled classes never appear here, and can't: cancelClass() deletes the
// enrollment rows outright (see service.ts) so employees fall back into the
// scheduling pool. The validated prototype keeps its cancelled roster as
// history and shows a Cancelled section; that history simply doesn't exist
// in this schema, so the section is deliberately absent rather than faked.
export async function listClassEnrollmentsForCompany(companyId: number) {
  return db
    .select({
      classId: classes.id,
      courseCode: courses.code,
      courseTitleEn: courses.titleEn,
      courseTitleAr: courses.titleAr,
      trainerFullName: trainers.fullName,
      centerName: trainingCenters.name,
      region: classes.region,
      startDate: classes.startDate,
      endDate: classes.endDate,
      classStatus: classes.status,
      employeeId: employees.id,
      employeeFullNameEn: employees.fullNameEn,
      employeeFullNameAr: employees.fullNameAr,
      enrollmentStatus: classEnrollments.status,
      attendancePct: classEnrollments.attendancePct,
    })
    .from(classEnrollments)
    .innerJoin(classes, eq(classEnrollments.classId, classes.id))
    .innerJoin(courses, eq(classes.courseId, courses.id))
    .innerJoin(trainers, eq(classes.trainerId, trainers.id))
    // centerId is nullable, so this must not be an inner join — an
    // otherwise-valid class with no centre assigned would vanish.
    .leftJoin(trainingCenters, eq(classes.centerId, trainingCenters.id))
    .innerJoin(employees, eq(classEnrollments.employeeId, employees.id))
    .where(eq(classEnrollments.companyId, companyId))
    .orderBy(desc(classes.startDate), asc(employees.fullNameEn));
}

// Trainer's own upcoming/active classes (Phase 7 builds the attendance/
// results UI on top of this).
export async function listClassesForTrainer(trainerId: number) {
  return db
    .select({
      id: classes.id,
      courseTitleEn: courses.titleEn,
      courseTitleAr: courses.titleAr,
      startDate: classes.startDate,
      endDate: classes.endDate,
      status: classes.status,
    })
    .from(classes)
    .innerJoin(courses, eq(classes.courseId, courses.id))
    .where(and(eq(classes.trainerId, trainerId), ne(classes.status, "cancelled")))
    .orderBy(desc(classes.startDate));
}
