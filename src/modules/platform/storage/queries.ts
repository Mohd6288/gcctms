import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documents } from "@/db/schema";
import type { DocumentType } from "./service";

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
  // The documents_type_check CHECK constraint guarantees this narrower
  // union at the database level; Drizzle's column type only knows "text".
  return rows.map((row) => ({ ...row, type: row.type as DocumentType }));
}
