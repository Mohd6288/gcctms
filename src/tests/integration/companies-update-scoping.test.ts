import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import { companies } from "../../db/schema";
import type { AuthContext } from "../../modules/platform/auth/shared";
import { updateCompany } from "../../modules/companies/service";

// Proves updateCompany's admin-only field restriction: crNumber/crVerified/
// region/contractorCategory are only applied for platform_admin/super_admin
// callers — a contractor_manager editing their own profile can change the
// shared fields but has those four silently ignored, matching the validated
// prototype's split between CompanyProfile.tsx (self-service, those four
// read-only) and EditCompanyDialog.tsx (admin-only, all editable).
describe("updateCompany — role-scoped field restrictions, real DB", () => {
  const suffix = randomUUID().slice(0, 8);
  const ownerAId = randomUUID();
  const ownerBId = randomUUID();
  const adminId = randomUUID();
  let companyAId: number;
  let companyBId: number;

  beforeAll(async () => {
    await db.execute(sql`insert into auth.users (id) values (${ownerAId}), (${ownerBId}), (${adminId})`);

    const [companyA] = await db
      .insert(companies)
      .values({
        name: "Update Scoping Test A",
        crNumber: `CR-UPD-A-${suffix}`,
        contactName: "Contact A",
        contactEmail: `upd-a-${suffix}@example.com`,
        contactPhone: "0500000001",
        ownerUserId: ownerAId,
        crVerified: false,
      })
      .returning({ id: companies.id });
    companyAId = companyA.id;

    const [companyB] = await db
      .insert(companies)
      .values({
        name: "Update Scoping Test B",
        crNumber: `CR-UPD-B-${suffix}`,
        contactName: "Contact B",
        contactEmail: `upd-b-${suffix}@example.com`,
        contactPhone: "0500000002",
        ownerUserId: ownerBId,
      })
      .returning({ id: companies.id });
    companyBId = companyB.id;
  });

  afterAll(async () => {
    await db.delete(companies).where(sql`id in (${companyAId}, ${companyBId})`);
    await db.execute(sql`delete from auth.users where id in (${ownerAId}, ${ownerBId}, ${adminId})`);
  });

  it("platform_admin can update every field, including crVerified/crNumber/region", async () => {
    const adminCtx: AuthContext = { userId: adminId, role: "platform_admin", companyId: null, trainerId: null, region: null, aal: "aal2" };
    await updateCompany(adminCtx, {
      companyId: companyAId,
      name: "Updated By Admin",
      sector: "Updated Sector",
      city: "Updated City",
      contactName: "Contact A",
      contactEmail: `upd-a-${suffix}@example.com`,
      contactPhone: "0500000001",
      crNumber: `CR-UPD-A-CHANGED-${suffix}`,
      crVerified: true,
      region: "East",
    });

    const [after] = await db.select().from(companies).where(eq(companies.id, companyAId));
    expect(after.name).toBe("Updated By Admin");
    expect(after.crVerified).toBe(true);
    expect(after.crNumber).toBe(`CR-UPD-A-CHANGED-${suffix}`);
    expect(after.region).toBe("East");
  });

  it("contractor_manager can update their own shared fields, but crVerified/crNumber/region are silently ignored", async () => {
    const contractorCtx: AuthContext = { userId: ownerBId, role: "contractor_manager", companyId: companyBId, trainerId: null, region: null, aal: "aal2" };
    await updateCompany(contractorCtx, {
      companyId: companyBId,
      name: "Updated By Contractor",
      sector: "Self-service Sector",
      city: "Self-service City",
      contactName: "New Contact Name",
      contactEmail: `upd-b-${suffix}@example.com`,
      contactPhone: "0500009999",
      crNumber: "0000000000", // should be ignored — not admin
      crVerified: true, // should be ignored — not admin
      region: "West", // should be ignored — not admin
    });

    const [after] = await db.select().from(companies).where(eq(companies.id, companyBId));
    expect(after.name).toBe("Updated By Contractor");
    expect(after.contactName).toBe("New Contact Name");
    expect(after.crNumber).toBe(`CR-UPD-B-${suffix}`); // unchanged
    expect(after.crVerified).toBe(true); // unchanged (was default true)
    expect(after.region).toBeNull(); // unchanged
  });

  it("contractor_manager cannot update a different company", async () => {
    const contractorCtx: AuthContext = { userId: ownerBId, role: "contractor_manager", companyId: companyBId, trainerId: null, region: null, aal: "aal2" };
    await expect(
      updateCompany(contractorCtx, {
        companyId: companyAId,
        name: "Should Not Apply",
        sector: "x",
        city: "x",
        contactName: "x",
        contactEmail: `nope-${suffix}@example.com`,
        contactPhone: "0500000000",
      })
    ).rejects.toThrow("Not authorized");
  });
});
