import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { courses, documents } from "../../db/schema";

// Every course except the induction itself is gated on a valid OHS General
// Induction (catalog/queries.ts), so any fixture that submits a request has
// to give its employees one. Granting it as a verified external certificate
// rather than an issued certificates row keeps fixtures cheap — an internal
// certificate would need a class, a trainer and an enrollment first.
export async function grantOhsInduction(companyId: number, employeeId: number, verifiedBy: string) {
  const [ohs] = await db.select({ id: courses.id }).from(courses).where(eq(courses.code, "CSCC00"));
  if (!ohs) throw new Error("CSCC00 is not in this database — run `npm run seed:catalog` before the integration suites.");

  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 2);

  // documents_protect_verification_columns_trg now fires on INSERT too, and
  // auth_role() is empty on this direct connection, so it would null
  // verified_at straight back out — the same deliberate bypass the trusted
  // server path uses in storage/service.ts.
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`);
    await tx.insert(documents).values({
      companyId,
      employeeId,
      type: "prior_certificate",
      courseId: ohs.id,
      expiresAt: expiresAt.toISOString().slice(0, 10),
      bucket: "documents",
      objectKey: randomUUID(),
      originalName: "ohs-induction.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1,
      checksumSha256: "0".repeat(64),
      uploadedBy: verifiedBy,
      verifiedBy,
      verifiedAt: new Date(),
    });
  });
}
