import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { documents } from "@/db/schema";

// Only ever national_id/prior_certificate in practice — registration_sheet/
// hrbl_request_form are request-scoped (requestId, not employeeId). The
// runtime filter makes that guarantee explicit rather than assumed.
type EmployeeDocumentType = "national_id" | "prior_certificate";

export async function listDocumentsForEmployee(employeeId: number) {
  const rows = await db
    .select({
      id: documents.id,
      type: documents.type,
      originalName: documents.originalName,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(eq(documents.employeeId, employeeId));
  return rows
    .filter((row): row is typeof row & { type: EmployeeDocumentType } => row.type === "national_id" || row.type === "prior_certificate")
    .map((row) => ({ ...row, type: row.type }));
}

// Which of a company's employees have a national_id document uploaded —
// feeds the request wizard's Step 3 completeness check (submitRequest's own
// guard is the real enforcement; this is just for showing the UI ahead of
// a failed submit attempt).
export async function getCompanyEmployeeIdsWithNationalId(companyId: number): Promise<Set<number>> {
  const rows = await db
    .select({ employeeId: documents.employeeId })
    .from(documents)
    .where(and(eq(documents.companyId, companyId), eq(documents.type, "national_id")));
  return new Set(rows.map((r) => r.employeeId).filter((id): id is number => id !== null));
}
