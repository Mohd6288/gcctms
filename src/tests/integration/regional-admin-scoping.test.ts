import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import { grantOhsInduction } from "../helpers/ohs-induction";
import { companies, courses, documents, employees, jobRoles, profiles, regionalAdminAssignments, requestItems, trainingRequests } from "../../db/schema";
import { encryptNationalId, hashNationalId } from "../../modules/platform/security/national-id";
import type { AuthContext } from "../../modules/platform/auth/shared";
import { listCompanies } from "../../modules/companies/queries";
import { listSubmittedRequestsForAdmin } from "../../modules/requests/queries";
import { createDraftRequest, submitRequest, syncRequestItems } from "../../modules/requests/service";
import { setAdminRegion } from "../../modules/scheduling/service";
import { uploadDocument } from "../../modules/platform/storage/service";

// Phase 5: a platform_admin assigned a region (regional_admin_assignments)
// sees only that region's data; unassigned (region: null in AuthContext)
// keeps today's behavior — sees everything. Drizzle bypasses RLS (see
// db/index.ts), so these query-layer filters are the real enforcement for
// every admin screen, not just a defense-in-depth extra.
describe("regional admin scoping — real DB", () => {
  const suffix = randomUUID().slice(0, 8);
  const ownerEastId = randomUUID();
  const ownerCentralId = randomUUID();
  const adminId = randomUUID();
  let companyEastId: number;
  let companyCentralId: number;
  let jobRoleId: number;
  let courseId: number;
  let employeeEastId: number;

  let contractorEastCtx: AuthContext;

  beforeAll(async () => {
    process.env.NATIONAL_ID_HASH_KEY ??= "test-only-key-do-not-use-in-real-envs";

    await db.execute(
      sql`insert into auth.users (id, email) values (${ownerEastId}, ${`region-owner-east-${suffix}@example.com`}), (${ownerCentralId}, ${`region-owner-central-${suffix}@example.com`}), (${adminId}, ${`region-admin-${suffix}@example.com`})`
    );
    await db.insert(profiles).values({ userId: adminId, role: "platform_admin", fullName: "Region Test Admin" });

    const [companyEast] = await db
      .insert(companies)
      .values({
        name: "Region Test Contractor East",
        crNumber: `CR-REGION-EAST-${suffix}`,
        contactName: "East Contact",
        contactEmail: `region-owner-east-${suffix}@example.com`,
        contactPhone: "0500000001",
        ownerUserId: ownerEastId,
        region: "East",
      })
      .returning({ id: companies.id });
    companyEastId = companyEast.id;

    const [companyCentral] = await db
      .insert(companies)
      .values({
        name: "Region Test Contractor Central",
        crNumber: `CR-REGION-CENTRAL-${suffix}`,
        contactName: "Central Contact",
        contactEmail: `region-owner-central-${suffix}@example.com`,
        contactPhone: "0500000002",
        ownerUserId: ownerCentralId,
        region: "Central",
      })
      .returning({ id: companies.id });
    companyCentralId = companyCentral.id;

    const [jobRole] = await db
      .insert(jobRoles)
      .values({ code: `REGION-ROLE-${suffix}`, nameEn: "Test Role", nameAr: "دور تجريبي" })
      .returning({ id: jobRoles.id });
    jobRoleId = jobRole.id;

    const [course] = await db
      .insert(courses)
      .values({ code: `REGION-CSCC-${suffix}`, titleEn: "Region Test Course", titleAr: "دورة", durationHours: "8" })
      .returning({ id: courses.id });
    courseId = course.id;

    const [employeeEast] = await db
      .insert(employees)
      .values({
        companyId: companyEastId,
        fullNameEn: "East Employee",
        fullNameAr: "موظف شرقي",
        nationalIdEnc: encryptNationalId("2377700001"),
        nationalIdHash: hashNationalId("2377700001"),
        jobRoleId,
      })
      .returning({ id: employees.id });
    employeeEastId = employeeEast.id;
    await db.insert(documents).values({
      companyId: companyEastId,
      employeeId: employeeEastId,
      type: "national_id",
      bucket: "documents",
      objectKey: randomUUID(),
      originalName: "id.pdf",
      mimeType: "application/pdf",
      sizeBytes: 10,
      checksumSha256: "0".repeat(64),
      uploadedBy: ownerEastId,
    });
    // Every course is gated on the OHS General Induction.
    await grantOhsInduction(companyEastId, employeeEastId, ownerEastId);

    contractorEastCtx = { userId: ownerEastId, role: "contractor_manager", companyId: companyEastId, trainerId: null, region: null, aal: "aal2" };

    const draft = await createDraftRequest(contractorEastCtx, { courseId });
    await syncRequestItems(contractorEastCtx, { requestId: draft.id, employeeIds: [employeeEastId] });
    await submitRequest(contractorEastCtx, draft.id);
  });

  afterAll(async () => {
    await db.delete(regionalAdminAssignments).where(eq(regionalAdminAssignments.adminUserId, adminId));
    await db.delete(requestItems).where(sql`request_id in (select id from ${trainingRequests} where company_id in (${companyEastId}, ${companyCentralId}))`);
    await db.delete(documents).where(sql`company_id in (${companyEastId}, ${companyCentralId})`);
    await db.delete(trainingRequests).where(sql`company_id in (${companyEastId}, ${companyCentralId})`);
    await db.delete(employees).where(eq(employees.companyId, companyEastId));
    await db.delete(courses).where(eq(courses.id, courseId));
    await db.delete(jobRoles).where(eq(jobRoles.id, jobRoleId));
    await db.delete(companies).where(sql`id in (${companyEastId}, ${companyCentralId})`);
    await db.delete(profiles).where(eq(profiles.userId, adminId));
    await db.execute(sql`delete from auth.users where id in (${ownerEastId}, ${ownerCentralId}, ${adminId})`);
  });

  it("listCompanies(region) only returns that region's companies; no region returns both", async () => {
    const eastOnly = await listCompanies("East");
    expect(eastOnly.some((c) => c.id === companyEastId)).toBe(true);
    expect(eastOnly.some((c) => c.id === companyCentralId)).toBe(false);

    const unrestricted = await listCompanies(null);
    expect(unrestricted.some((c) => c.id === companyEastId)).toBe(true);
    expect(unrestricted.some((c) => c.id === companyCentralId)).toBe(true);
  });

  it("listSubmittedRequestsForAdmin(region) only returns requests for that region's companies", async () => {
    const eastOnly = await listSubmittedRequestsForAdmin("East");
    expect(eastOnly.some((r) => r.companyName === "Region Test Contractor East")).toBe(true);

    const centralOnly = await listSubmittedRequestsForAdmin("Central");
    expect(centralOnly.some((r) => r.companyName === "Region Test Contractor East")).toBe(false);
  });

  it("assertCanTouchCompany denies a region-mismatched platform_admin but allows a matching or unassigned one", async () => {
    const adminEastCtx: AuthContext = { userId: adminId, role: "platform_admin", companyId: null, trainerId: null, region: "East", aal: "aal2" };
    const adminCentralCtx: AuthContext = { userId: adminId, role: "platform_admin", companyId: null, trainerId: null, region: "Central", aal: "aal2" };
    const adminUnassignedCtx: AuthContext = { userId: adminId, role: "platform_admin", companyId: null, trainerId: null, region: null, aal: "aal2" };

    const file = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: "application/pdf" });

    await expect(
      uploadDocument(adminCentralCtx, { companyId: companyEastId, employeeId: employeeEastId, type: "other", file: file("x.pdf") })
    ).rejects.toThrow("Not authorized");

    await expect(
      uploadDocument(adminEastCtx, { companyId: companyEastId, employeeId: employeeEastId, type: "other", file: file("y.pdf") })
    ).resolves.toBeTruthy();

    await expect(
      uploadDocument(adminUnassignedCtx, { companyId: companyEastId, employeeId: employeeEastId, type: "other", file: file("z.pdf") })
    ).resolves.toBeTruthy();
  });

  it("moves an admin between regions, holding at most one at a time", async () => {
    const superAdminCtx: AuthContext = { userId: randomUUID(), role: "super_admin", companyId: null, trainerId: null, region: null, aal: "aal2" };

    await setAdminRegion(superAdminCtx, { adminUserId: adminId, region: "East" });
    let rows = await db.select().from(regionalAdminAssignments).where(eq(regionalAdminAssignments.adminUserId, adminId));
    expect(rows.map((r) => r.region)).toEqual(["East"]);

    await setAdminRegion(superAdminCtx, { adminUserId: adminId, region: "Central" });
    rows = await db.select().from(regionalAdminAssignments).where(eq(regionalAdminAssignments.adminUserId, adminId));
    expect(rows.map((r) => r.region)).toEqual(["Central"]); // moved, not duplicated

    await setAdminRegion(superAdminCtx, { adminUserId: adminId, region: null });
    rows = await db.select().from(regionalAdminAssignments).where(eq(regionalAdminAssignments.adminUserId, adminId));
    expect(rows).toEqual([]); // unassigned means no row at all
  });

  // The whole point of 0030: region used to be the primary key, so the
  // platform could never have more regional admins than regions, and two
  // admins could never share one.
  it("puts several admins in the same region", async () => {
    const superAdminCtx: AuthContext = { userId: randomUUID(), role: "super_admin", companyId: null, trainerId: null, region: null, aal: "aal2" };
    const secondAdminId = randomUUID();
    await db.execute(sql`insert into auth.users (id) values (${secondAdminId})`);

    await setAdminRegion(superAdminCtx, { adminUserId: adminId, region: "Central" });
    await setAdminRegion(superAdminCtx, { adminUserId: secondAdminId, region: "Central" });

    const central = await db.select().from(regionalAdminAssignments).where(eq(regionalAdminAssignments.region, "Central"));
    expect(central.map((r) => r.adminUserId).sort()).toEqual([adminId, secondAdminId].sort());

    await db.delete(regionalAdminAssignments).where(eq(regionalAdminAssignments.adminUserId, secondAdminId));
    await db.execute(sql`delete from auth.users where id = ${secondAdminId}`);
  });

  it("setAdminRegion rejects a non-super_admin caller", async () => {
    const platformAdminCtx: AuthContext = { userId: adminId, role: "platform_admin", companyId: null, trainerId: null, region: null, aal: "aal2" };
    await expect(setAdminRegion(platformAdminCtx, { adminUserId: adminId, region: "East" })).rejects.toThrow("Not authorized");
  });
});
