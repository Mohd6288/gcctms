// requests module — read-side queries (Drizzle, RLS-scoped via lib/supabase/server.ts).
import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { companies, courses, documents, employees, requestItems, trainingRequests } from "@/db/schema";

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
export async function listSubmittedRequestsForAdmin() {
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
    .where(eq(trainingRequests.status, "submitted"))
    .orderBy(desc(trainingRequests.createdAt));
}

export async function getRequestById(requestId: number) {
  const [request] = await db
    .select({
      id: trainingRequests.id,
      companyId: trainingRequests.companyId,
      companyName: companies.name,
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
    })
    .from(requestItems)
    .innerJoin(employees, eq(requestItems.employeeId, employees.id))
    .where(eq(requestItems.requestId, requestId));
}

// The two request-level documents (registration_sheet, hrbl_request_form) —
// never the employee-scoped national_id/prior_certificate ones.
export async function getRequestLevelDocuments(requestId: number) {
  return db
    .select({
      id: documents.id,
      type: documents.type,
      originalName: documents.originalName,
      verifiedAt: documents.verifiedAt,
    })
    .from(documents)
    .where(eq(documents.requestId, requestId));
}

export async function listActiveCourses() {
  return db
    .select({ id: courses.id, titleEn: courses.titleEn, titleAr: courses.titleAr })
    .from(courses)
    .where(eq(courses.active, true))
    .orderBy(courses.titleEn);
}
