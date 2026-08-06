import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import { companies, documents, employees, jobRoles } from "../../db/schema";
import { createAdminClient } from "../../lib/supabase/admin";
import { getSignedDownloadUrl, uploadDocument } from "../../modules/platform/storage/service";
import type { AuthContext } from "../../modules/platform/auth/shared";

// The other half of "cross-tenant download denied at DB and endpoint" (see
// tests/rls/documents-cross-tenant.test.ts for the DB half). This exercises
// the actual functions src/app/api/documents/[id]/download/route.ts calls —
// uploadDocument() and getSignedDownloadUrl() — proving a real uploaded file
// can only be signed-URL'd by its own company or platform_admin.
describe("document upload + signed-URL download — cross-tenant denial", () => {
  const suffix = randomUUID().slice(0, 8);
  const ownerAId = randomUUID();
  const ownerBId = randomUUID();
  const platformAdminId = randomUUID();
  let companyAId: number;
  let companyBId: number;
  let employeeAId: number;
  let jobRoleId: number;
  let documentId: number;
  let objectKey: string;

  beforeAll(async () => {
    process.env.NATIONAL_ID_HASH_KEY ??= "test-only-key-do-not-use-in-real-envs";

    await db.execute(sql`insert into auth.users (id) values (${ownerAId}), (${ownerBId}), (${platformAdminId})`);

    const [companyA] = await db
      .insert(companies)
      .values({
        name: "Upload Test Contractor A",
        crNumber: `CR-UP-A-${suffix}`,
        contactName: "A Contact",
        contactEmail: `up-a-${suffix}@example.com`,
        contactPhone: "0500000001",
        ownerUserId: ownerAId,
      })
      .returning({ id: companies.id });
    companyAId = companyA.id;

    const [companyB] = await db
      .insert(companies)
      .values({
        name: "Upload Test Contractor B",
        crNumber: `CR-UP-B-${suffix}`,
        contactName: "B Contact",
        contactEmail: `up-b-${suffix}@example.com`,
        contactPhone: "0500000002",
        ownerUserId: ownerBId,
      })
      .returning({ id: companies.id });
    companyBId = companyB.id;

    const [jobRole] = await db
      .insert(jobRoles)
      .values({ code: `UP-ROLE-${suffix}`, nameEn: "Test Role", nameAr: "دور تجريبي" })
      .returning({ id: jobRoles.id });
    jobRoleId = jobRole.id;

    const [employee] = await db
      .insert(employees)
      .values({
        companyId: companyAId,
        fullNameEn: "Doc Test Employee",
        fullNameAr: "موظف اختبار",
        nationalIdEnc: Buffer.from("placeholder"),
        nationalIdHash: `hash-${suffix}`,
        jobRoleId,
      })
      .returning({ id: employees.id });
    employeeAId = employee.id;
  });

  afterAll(async () => {
    if (objectKey) {
      await createAdminClient().storage.from("documents").remove([objectKey]);
    }
    await db.delete(documents).where(sql`id = ${documentId}`);
    await db.delete(employees).where(eq(employees.id, employeeAId));
    await db.delete(jobRoles).where(eq(jobRoles.id, jobRoleId));
    await db.delete(companies).where(sql`id in (${companyAId}, ${companyBId})`);
    await db.execute(sql`delete from auth.users where id in (${ownerAId}, ${ownerBId}, ${platformAdminId})`);
  });

  function contractorContext(userId: string, companyId: number): AuthContext {
    return { userId, role: "contractor_manager", companyId, trainerId: null, region: null, aal: "aal2" };
  }

  it("company A uploads a real document to the private bucket", async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], "iqama.pdf", { type: "application/pdf" });
    const doc = await uploadDocument(contractorContext(ownerAId, companyAId), {
      companyId: companyAId,
      employeeId: employeeAId,
      type: "national_id",
      file,
    });
    documentId = doc.id;

    const [row] = await db.select({ objectKey: documents.objectKey }).from(documents).where(eq(documents.id, doc.id));
    objectKey = row.objectKey;
    expect(objectKey).toMatch(/^[0-9a-f-]{36}$/); // opaque UUID, no PII
  });

  it("company B is denied a signed URL for company A's document", async () => {
    await expect(getSignedDownloadUrl(contractorContext(ownerBId, companyBId), documentId)).rejects.toThrow(
      "Not authorized"
    );
  });

  it("company A can get a signed URL for its own document", async () => {
    const url = await getSignedDownloadUrl(contractorContext(ownerAId, companyAId), documentId);
    expect(url).toContain("/storage/v1/object/sign/documents/");
  });

  it("platform_admin can get a signed URL for any company's document", async () => {
    const context: AuthContext = { userId: platformAdminId, role: "platform_admin", companyId: null, trainerId: null, region: null, aal: "aal2" };
    const url = await getSignedDownloadUrl(context, documentId);
    expect(url).toContain("/storage/v1/object/sign/documents/");
  });
});
