// certification module — read-side queries (Drizzle, RLS-scoped via lib/supabase/server.ts).
import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { certificates, classes, companies, courses, employees } from "@/db/schema";

export async function listPendingApprovalCertificatesForClass(classId: number) {
  return db
    .select({
      id: certificates.id,
      employeeId: certificates.employeeId,
      employeeFullNameEn: employees.fullNameEn,
      employeeFullNameAr: employees.fullNameAr,
      eligibility: certificates.eligibility,
    })
    .from(certificates)
    .innerJoin(employees, eq(certificates.employeeId, employees.id))
    .where(eq(certificates.classId, classId));
}

export async function listCertificatesForCompany(companyId: number) {
  return db
    .select({
      id: certificates.id,
      serial: certificates.serial,
      employeeFullNameEn: employees.fullNameEn,
      employeeFullNameAr: employees.fullNameAr,
      courseCode: courses.code,
      courseTitleEn: courses.titleEn,
      courseTitleAr: courses.titleAr,
      issuedAt: certificates.issuedAt,
      expiresAt: certificates.expiresAt,
      status: certificates.status,
    })
    .from(certificates)
    .innerJoin(employees, eq(certificates.employeeId, employees.id))
    .innerJoin(courses, eq(certificates.courseId, courses.id))
    .where(eq(certificates.companyId, companyId))
    .orderBy(desc(certificates.createdAt));
}

// Public verify page — the only query in this module a completely
// unauthenticated request ever reaches. Deliberately restricted to
// status='issued' in the WHERE clause itself (never 'pending_approval' or
// 'rejected') and to only the fields the page is allowed to show; masking
// the name and omitting Iqama/company detail happens in the page component
// (see roles-and-workflows.md's public verify page spec) — this query
// never even selects the Iqama or company name in the first place.
export async function getIssuedCertificateBySerial(serial: string) {
  const [cert] = await db
    .select({
      serial: certificates.serial,
      status: certificates.status,
      employeeFullNameEn: employees.fullNameEn,
      courseTitleEn: courses.titleEn,
      courseTitleAr: courses.titleAr,
      courseCode: courses.code,
      issuedAt: certificates.issuedAt,
      expiresAt: certificates.expiresAt,
      revokedReason: certificates.revokedReason,
    })
    .from(certificates)
    .innerJoin(employees, eq(certificates.employeeId, employees.id))
    .innerJoin(courses, eq(certificates.courseId, courses.id))
    .where(eq(certificates.serial, serial));
  if (!cert || (cert.status !== "issued" && cert.status !== "revoked")) return null;
  return cert;
}

export async function getCertificateWithPdfForDownload(certificateId: number) {
  const [cert] = await db
    .select({ id: certificates.id, companyId: certificates.companyId, pdfObjectKey: certificates.pdfObjectKey, status: certificates.status })
    .from(certificates)
    .where(eq(certificates.id, certificateId));
  return cert ?? null;
}

// Full detail for rendering the PDF at approval time.
export async function getCertificateRenderData(certificateId: number) {
  const [row] = await db
    .select({
      certificateId: certificates.id,
      employeeId: certificates.employeeId,
      employeeFullNameEn: employees.fullNameEn,
      employeeFullNameAr: employees.fullNameAr,
      nationalIdEnc: employees.nationalIdEnc,
      companyName: companies.name,
      courseCode: courses.code,
      courseTitleEn: courses.titleEn,
      courseTitleAr: courses.titleAr,
      classStartDate: classes.startDate,
      classEndDate: classes.endDate,
    })
    .from(certificates)
    .innerJoin(employees, eq(certificates.employeeId, employees.id))
    .innerJoin(companies, eq(certificates.companyId, companies.id))
    .innerJoin(courses, eq(certificates.courseId, courses.id))
    .innerJoin(classes, eq(certificates.classId, classes.id))
    .where(eq(certificates.id, certificateId));
  return row ?? null;
}
