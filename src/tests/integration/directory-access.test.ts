import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import { auditLog, companies, employees, jobRoles } from "../../db/schema";
import { assertCanViewCompany } from "../../modules/directory/access";
import { getEmployeeProfile, getEntityHistory } from "../../modules/directory/queries";
import { encryptNationalId, hashNationalId } from "../../modules/platform/security/national-id";
import type { AuthContext } from "../../modules/platform/auth/shared";

// Drizzle bypasses RLS and an auditor has no policies at all (0033), so
// assertCanViewCompany is the entire enforcement for every profile page.
describe("directory access and history — real DB", () => {
  const suffix = randomUUID().slice(0, 8);
  const ownerA = randomUUID();
  const ownerB = randomUUID();
  const actorId = randomUUID();
  let companyCentral: number;
  let companyEast: number;
  let jobRoleId: number;
  let employeeId: number;

  const ctx = (role: AuthContext["role"], extra: Partial<AuthContext> = {}): AuthContext => ({
    userId: randomUUID(),
    role,
    companyId: null,
    trainerId: null,
    region: null,
    aal: "aal2",
    ...extra,
  });

  beforeAll(async () => {
    process.env.NATIONAL_ID_HASH_KEY ??= "test-only-key-do-not-use-in-real-envs";
    await db.execute(sql`insert into auth.users (id) values (${ownerA}), (${ownerB}), (${actorId})`);

    const [a] = await db
      .insert(companies)
      .values({
        name: `Dir Central ${suffix}`, crNumber: `DIR-C-${suffix}`, contactName: "A",
        contactEmail: `a-${suffix}@example.com`, contactPhone: "0500000001", ownerUserId: ownerA, region: "Central",
      })
      .returning({ id: companies.id });
    companyCentral = a.id;

    const [b] = await db
      .insert(companies)
      .values({
        name: `Dir East ${suffix}`, crNumber: `DIR-E-${suffix}`, contactName: "B",
        contactEmail: `b-${suffix}@example.com`, contactPhone: "0500000002", ownerUserId: ownerB, region: "East",
      })
      .returning({ id: companies.id });
    companyEast = b.id;

    const [role] = await db.insert(jobRoles).values({ code: `DIR-${suffix}`, nameEn: "Dir Role", nameAr: "دور" }).returning({ id: jobRoles.id });
    jobRoleId = role.id;

    const iqama = `2${suffix.replace(/\D/g, "").padEnd(9, "7").slice(0, 9)}`;
    const [employee] = await db
      .insert(employees)
      .values({
        companyId: companyCentral, fullNameEn: "Directory Person", fullNameAr: "شخص",
        nationalIdEnc: encryptNationalId(iqama), nationalIdHash: hashNationalId(iqama), jobRoleId,
      })
      .returning({ id: employees.id });
    employeeId = employee.id;
  });

  afterAll(async () => {
    await db.execute(sql`delete from audit_log where entity_type in ('employee', 'directory_other') and entity_id in (${employeeId}, ${employeeId + 1})`);
    await db.delete(employees).where(eq(employees.id, employeeId));
    await db.delete(companies).where(inArray(companies.id, [companyCentral, companyEast]));
    await db.delete(jobRoles).where(eq(jobRoles.id, jobRoleId));
    await db.execute(sql`delete from auth.users where id in (${ownerA}, ${ownerB}, ${actorId})`);
  });

  it("lets an auditor and a super admin view any company", async () => {
    await expect(assertCanViewCompany(ctx("auditor"), companyCentral)).resolves.toBeUndefined();
    await expect(assertCanViewCompany(ctx("auditor"), companyEast)).resolves.toBeUndefined();
    await expect(assertCanViewCompany(ctx("super_admin"), companyEast)).resolves.toBeUndefined();
  });

  it("scopes a region-assigned admin, and leaves an unassigned one unrestricted", async () => {
    const central = ctx("platform_admin", { region: "Central" });
    await expect(assertCanViewCompany(central, companyCentral)).resolves.toBeUndefined();
    await expect(assertCanViewCompany(central, companyEast)).rejects.toThrow("Not authorized");

    // Unassigned means unrestricted, not "no access" — the rule since 0026.
    await expect(assertCanViewCompany(ctx("platform_admin"), companyEast)).resolves.toBeUndefined();
  });

  it("holds a contractor to their own company, and keeps trainers out entirely", async () => {
    await expect(assertCanViewCompany(ctx("contractor_manager", { companyId: companyCentral }), companyCentral)).resolves.toBeUndefined();
    await expect(assertCanViewCompany(ctx("contractor_manager", { companyId: companyCentral }), companyEast)).rejects.toThrow("Not authorized");
    await expect(assertCanViewCompany(ctx("trainer"), companyCentral)).rejects.toThrow("Not authorized");
    await expect(assertCanViewCompany(null, companyCentral)).rejects.toThrow("Not authorized");
  });

  it("never returns the raw Iqama from a profile, only the masked tail", async () => {
    const profile = await getEmployeeProfile(employeeId);
    expect(profile).toBeTruthy();
    // The encrypted column must not travel with the row at all.
    expect(Object.keys(profile!)).not.toContain("nationalIdEnc");
    expect(profile!.nationalIdMasked).toMatch(/^•+\d{4}$/);
  });

  it("returns only this entity's history, newest first", async () => {
    await db.insert(auditLog).values([
      { userId: actorId, entityType: "employee", entityId: employeeId, action: "create" },
      { userId: actorId, entityType: "employee", entityId: employeeId, action: "update" },
      // A different entity of the same type must not bleed in.
      { userId: actorId, entityType: "employee", entityId: employeeId + 1, action: "create" },
    ]);

    const history = await getEntityHistory("employee", employeeId);
    expect(history).toHaveLength(2);
    // Newest first, and nothing belonging to the neighbouring entity id.
    expect(history.map((h) => h.action)).toEqual(["update", "create"]);
  });
});
