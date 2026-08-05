import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { documents } from "@/db/schema";

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
