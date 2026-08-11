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
  await grantPriorCertificate(companyId, employeeId, "CSCC00", verifiedBy);
}

// The general form: hand an employee a verified external certificate for any
// course. This is the real path a contractor uses for the technical tests'
// four entry certificates — upload, admin verifies, gate satisfied — so a
// fixture built this way exercises what production does.
export async function grantPriorCertificate(
  companyId: number,
  employeeId: number,
  courseCode: string,
  verifiedBy: string
) {
  const [course] = await db.select({ id: courses.id }).from(courses).where(eq(courses.code, courseCode));
  if (!course) {
    throw new Error(`${courseCode} is not in this database — run \`npm run seed:catalog\` before the integration suites.`);
  }

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
      courseId: course.id,
      expiresAt: expiresAt.toISOString().slice(0, 10),
      bucket: "documents",
      objectKey: randomUUID(),
      originalName: `${courseCode.toLowerCase()}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 1,
      checksumSha256: "0".repeat(64),
      uploadedBy: verifiedBy,
      verifiedBy,
      verifiedAt: new Date(),
    });
  });
}
