import "server-only";
import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import { companies, courses, documents, employees } from "@/db/schema";

// Only ever national_id/prior_certificate/other in practice — registration_sheet/
// hrbl_request_form are request-scoped (requestId, not employeeId). The
// runtime filter makes that guarantee explicit rather than assumed.
type EmployeeDocumentType = "national_id" | "prior_certificate" | "other";
const EMPLOYEE_DOCUMENT_TYPES: EmployeeDocumentType[] = ["national_id", "prior_certificate", "other"];

export async function listDocumentsForEmployee(employeeId: number) {
  const rows = await db
    .select({
      id: documents.id,
      type: documents.type,
      originalName: documents.originalName,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(and(eq(documents.employeeId, employeeId), inArray(documents.type, EMPLOYEE_DOCUMENT_TYPES)));
  return rows as (Omit<(typeof rows)[number], "type"> & { type: EmployeeDocumentType })[];
}

// Every employee-scoped document across the whole company, for the request
// wizard's Step 3 — fetched once and grouped by employeeId client-side
// rather than per-employee, since the wizard's selected-employee set
// changes client-side after page load (Step 2's Add/Import panels).
export async function listEmployeeDocumentsForCompany(companyId: number) {
  const rows = await db
    .select({ id: documents.id, employeeId: documents.employeeId, type: documents.type, originalName: documents.originalName })
    .from(documents)
    .where(and(eq(documents.companyId, companyId), inArray(documents.type, EMPLOYEE_DOCUMENT_TYPES)));
  return rows
    .filter((r): r is typeof r & { employeeId: number; type: EmployeeDocumentType } => r.employeeId !== null)
    .map((r) => ({ ...r }));
}

// External certificates (0027): prior_certificate rows carrying a course
// link, i.e. a certificate the employee already holds from outside this
// platform. Distinct from the unstructured prior_certificate slot, which has
// no course_id and never satisfies a prerequisite.
export async function listExternalCertificatesForCompany(companyId: number) {
  return db
    .select({
      id: documents.id,
      employeeId: documents.employeeId,
      courseId: documents.courseId,
      originalName: documents.originalName,
      issuedAt: documents.issuedAt,
      expiresAt: documents.expiresAt,
      verifiedAt: documents.verifiedAt,
      rejectedAt: documents.rejectedAt,
      rejectionReason: documents.rejectionReason,
    })
    .from(documents)
    .where(and(eq(documents.companyId, companyId), eq(documents.type, "prior_certificate"), isNotNull(documents.courseId)));
}

// Admin review queue. Pending only — a contractor is blocked from submitting
// until these are decided, so this is the screen that unblocks them, and a
// region-scoped platform_admin (0026) sees only their own region's.
export async function listPendingExternalCertificates(region?: string | null) {
  return db
    .select({
      id: documents.id,
      originalName: documents.originalName,
      issuedAt: documents.issuedAt,
      expiresAt: documents.expiresAt,
      createdAt: documents.createdAt,
      employeeNameEn: employees.fullNameEn,
      employeeNameAr: employees.fullNameAr,
      companyName: companies.name,
      companyRegion: companies.region,
      courseCode: courses.code,
      courseTitleEn: courses.titleEn,
      courseTitleAr: courses.titleAr,
    })
    .from(documents)
    .innerJoin(employees, eq(employees.id, documents.employeeId))
    .innerJoin(companies, eq(companies.id, documents.companyId))
    .innerJoin(courses, eq(courses.id, documents.courseId))
    .where(
      and(
        eq(documents.type, "prior_certificate"),
        isNotNull(documents.courseId),
        isNull(documents.verifiedAt),
        isNull(documents.rejectedAt),
        region ? eq(companies.region, region) : undefined
      )
    )
    .orderBy(asc(documents.createdAt));
}
