import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../../db";
import { companies, documents } from "../../db/schema";
import { withRole } from "./with-role";

// Phase 3 acceptance criteria: "cross-tenant download denied at DB and
// endpoint". This is the DB half — proves at the real database (not the
// app layer) that a contractor from one company cannot SELECT another
// company's document row. The endpoint's getSignedDownloadUrl() never
// even reaches Supabase Storage for a denied request because it can't
// find the document to begin with once scoped correctly — see
// tests/integration/document-download-cross-tenant.test.ts for that half.
describe("RLS — documents cross-tenant SELECT denial", () => {
  const suffix = randomUUID().slice(0, 8);
  const ownerAId = randomUUID();
  const ownerBId = randomUUID();
  let companyAId: number;
  let companyBId: number;
  let documentId: number;

  beforeAll(async () => {
    await db.execute(sql`insert into auth.users (id) values (${ownerAId}), (${ownerBId})`);

    const [companyA] = await db
      .insert(companies)
      .values({
        name: "RLS Doc Test Contractor A",
        crNumber: `CR-DOC-A-${suffix}`,
        contactName: "A Contact",
        contactEmail: `doc-a-${suffix}@example.com`,
        contactPhone: "0500000001",
        ownerUserId: ownerAId,
      })
      .returning({ id: companies.id });
    companyAId = companyA.id;

    const [companyB] = await db
      .insert(companies)
      .values({
        name: "RLS Doc Test Contractor B",
        crNumber: `CR-DOC-B-${suffix}`,
        contactName: "B Contact",
        contactEmail: `doc-b-${suffix}@example.com`,
        contactPhone: "0500000002",
        ownerUserId: ownerBId,
      })
      .returning({ id: companies.id });
    companyBId = companyB.id;

    const [doc] = await db
      .insert(documents)
      .values({
        companyId: companyAId,
        type: "national_id",
        bucket: "documents",
        objectKey: randomUUID(),
        originalName: "iqama.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024,
        checksumSha256: "0".repeat(64),
        uploadedBy: ownerAId,
      })
      .returning({ id: documents.id });
    documentId = doc.id;
  });

  afterAll(async () => {
    await db.delete(documents).where(sql`id = ${documentId}`);
    await db.delete(companies).where(sql`id in (${companyAId}, ${companyBId})`);
    await db.execute(sql`delete from auth.users where id in (${ownerAId}, ${ownerBId})`);
  });

  it("company B cannot see company A's document via SELECT", async () => {
    const rows = await withRole(
      { sub: ownerBId, role: "authenticated", user_role: "contractor_manager", company_id: companyBId },
      (tx) => tx.select().from(documents).where(sql`id = ${documentId}`)
    );
    expect(rows).toHaveLength(0);
  });

  it("company A can see its own document via SELECT", async () => {
    const rows = await withRole(
      { sub: ownerAId, role: "authenticated", user_role: "contractor_manager", company_id: companyAId },
      (tx) => tx.select().from(documents).where(sql`id = ${documentId}`)
    );
    expect(rows).toHaveLength(1);
  });

  it("platform_admin can see any company's document", async () => {
    const rows = await withRole({ sub: randomUUID(), role: "authenticated", user_role: "platform_admin" }, (tx) =>
      tx.select().from(documents).where(sql`id = ${documentId}`)
    );
    expect(rows).toHaveLength(1);
  });
});
