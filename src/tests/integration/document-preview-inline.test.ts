import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { db } from "../../db";
import { companies, documents, employees, jobRoles } from "../../db/schema";
import { encryptNationalId, hashNationalId } from "../../modules/platform/security/national-id";
import { getSignedDownloadUrl, uploadDocument } from "../../modules/platform/storage/service";
import type { AuthContext } from "../../modules/platform/auth/shared";

// The in-page preview points an <img>/<iframe> straight at the Storage
// signed URL. That only renders if Storage serves the bytes inline — a
// Content-Disposition: attachment would turn every preview into a silent
// download prompt, which is exactly what the preview exists to avoid.
it("signed URL serves the bytes inline so <img>/<iframe> can render them", async () => {
  process.env.NATIONAL_ID_HASH_KEY ??= "test-only-key-do-not-use-in-real-envs";
  const suffix = randomUUID().slice(0, 8);
  const ownerId = randomUUID();
  await db.execute(sql`insert into auth.users (id) values (${ownerId})`);
  const [company] = await db.insert(companies).values({ name: "Preview Check", crNumber: `CR-PRV-${suffix}`, contactName: "C", contactEmail: `prv-${suffix}@example.com`, contactPhone: "0500000001", ownerUserId: ownerId }).returning({ id: companies.id });
  const [role] = await db.insert(jobRoles).values({ code: `PRV-${suffix}`, nameEn: "R", nameAr: "R" }).returning({ id: jobRoles.id });
  const [emp] = await db.insert(employees).values({ companyId: company.id, fullNameEn: "P", fullNameAr: "P", nationalIdEnc: encryptNationalId("2300011122"), nationalIdHash: hashNationalId("2300011122"), jobRoleId: role.id }).returning({ id: employees.id });

  const ctx: AuthContext = { userId: ownerId, role: "contractor_manager", companyId: company.id, trainerId: null, region: null, aal: "aal2" };
  // 1x1 PNG
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const file = new File([new Uint8Array(png)], "iqama.png", { type: "image/png" });
  const doc = await uploadDocument(ctx, { companyId: company.id, employeeId: emp.id, type: "national_id", file });

  const url = await getSignedDownloadUrl(ctx, doc.id);
  const res = await fetch(url);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("image/png");
  expect(res.headers.get("content-disposition") ?? "inline").not.toContain("attachment");

  await db.delete(documents).where(eq(documents.companyId, company.id));
  await db.delete(employees).where(eq(employees.companyId, company.id));
  await db.delete(companies).where(eq(companies.id, company.id));
  await db.delete(jobRoles).where(eq(jobRoles.id, role.id));
  await db.execute(sql`delete from auth.users where id = ${ownerId}`);
});
