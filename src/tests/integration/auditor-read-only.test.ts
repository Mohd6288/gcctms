import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import { companies, employees, jobRoles, profiles } from "../../db/schema";
import type { AuthContext } from "../../modules/platform/auth/shared";
import { authorize } from "../../modules/platform/auth/shared";
import { listAuditCertificates, listAuditRequests, listAuditActivity, getAuditOverview } from "../../modules/audit/queries";
import { createEmployee } from "../../modules/employees/service";
import { getSignedDownloadUrl, uploadDocument } from "../../modules/platform/storage/service";
import { setAdminRegion } from "../../modules/scheduling/service";

// An auditor is the one role whose purpose is to see everything, which makes
// it the one whose limits are worth proving rather than assuming: read-only
// in fact, and blind to the two things the masking decision withheld —
// Iqama numbers and uploaded documents.
describe("auditor — read-only, and masked where it was promised", () => {
  const suffix = randomUUID().slice(0, 8);
  const auditorId = randomUUID();
  const ownerId = randomUUID();
  let companyId: number;
  let jobRoleId: number;
  let documentId: number;

  const auditor: AuthContext = { userId: auditorId, role: "auditor", companyId: null, trainerId: null, region: null, aal: "aal2" };

  beforeAll(async () => {
    process.env.NATIONAL_ID_HASH_KEY ??= "test-only-key-do-not-use-in-real-envs";
    await db.execute(sql`insert into auth.users (id) values (${auditorId}), (${ownerId})`);
    await db.insert(profiles).values({ userId: auditorId, role: "auditor", fullName: "Test Auditor" });

    const [company] = await db
      .insert(companies)
      .values({
        name: "Auditor Test Contractor",
        crNumber: `CR-AUD-${suffix}`,
        contactName: "C",
        contactEmail: `aud-${suffix}@example.com`,
        contactPhone: "0500000001",
        ownerUserId: ownerId,
        region: "Central",
      })
      .returning({ id: companies.id });
    companyId = company.id;

    const [jobRole] = await db.insert(jobRoles).values({ code: `AUD-${suffix}`, nameEn: "R", nameAr: "R" }).returning({ id: jobRoles.id });
    jobRoleId = jobRole.id;

    const contractor: AuthContext = { userId: ownerId, role: "contractor_manager", companyId, trainerId: null, region: null, aal: "aal2" };
    const doc = await uploadDocument(contractor, {
      companyId,
      type: "other",
      file: new File([new Uint8Array([1, 2, 3])], "x.pdf", { type: "application/pdf" }),
    });
    documentId = doc.id;
  });

  afterAll(async () => {
    await db.execute(sql`delete from documents where company_id = ${companyId}`);
    await db.delete(employees).where(eq(employees.companyId, companyId));
    await db.delete(companies).where(eq(companies.id, companyId));
    await db.delete(jobRoles).where(eq(jobRoles.id, jobRoleId));
    await db.delete(profiles).where(eq(profiles.userId, auditorId));
    await db.execute(sql`delete from auth.users where id in (${auditorId}, ${ownerId})`);
  });

  it("holds only read capabilities — no mutation capability at all", () => {
    for (const capability of ["view_audit_portal", "view_reports", "view_certificates", "view_audit_log"] as const) {
      expect(authorize(capability, auditor)).toBe(true);
    }
    for (const capability of [
      "manage_users",
      "manage_companies",
      "manage_employees",
      "upload_documents",
      "submit_requests",
      "review_requests",
      "verify_payments",
      "schedule_classes",
      "record_attendance",
      "record_results",
      "approve_certificates",
      "manage_catalog",
      "manage_pricing",
      "manage_trainer_roster",
    ] as const) {
      expect(authorize(capability, auditor), `${capability} must be denied`).toBe(false);
    }
  });

  it("is refused by the write paths it might plausibly reach", async () => {
    await expect(
      createEmployee(auditor, {
        companyId,
        fullNameEn: "Nope",
        fullNameAr: "Nope",
        nationalId: "2300099988",
        jobRoleId,
      })
    ).rejects.toThrow("Not authorized");

    await expect(
      uploadDocument(auditor, { companyId, type: "other", file: new File([new Uint8Array([1])], "y.pdf", { type: "application/pdf" }) })
    ).rejects.toThrow("Not authorized");

    await expect(setAdminRegion(auditor, { adminUserId: auditorId, region: "Central" })).rejects.toThrow("Not authorized");
  });

  it("cannot pull an uploaded document, only know one exists", async () => {
    await expect(getSignedDownloadUrl(auditor, documentId)).rejects.toThrow("Not authorized");
  });

  it("never returns an Iqama from any audit view", async () => {
    const [requests, certs, activity] = [await listAuditRequests(), await listAuditCertificates(), await listAuditActivity()];
    const serialised = JSON.stringify({ requests, certs, activity });
    expect(serialised).not.toMatch(/national_?[Ii]d/);
    expect(serialised).not.toMatch(/nationalIdEnc|nationalIdHash/);
    for (const row of certs) {
      expect(Object.keys(row)).not.toContain("iqama");
    }
  });

  it("still returns the operational picture it exists to audit", async () => {
    const overview = await getAuditOverview();
    expect(typeof overview.companies).toBe("number");
    expect(overview.companies).toBeGreaterThan(0);
  });
});
