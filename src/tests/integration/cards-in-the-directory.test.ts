import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import {
  classes,
  companies,
  courses,
  employees,
  jobRoles,
  manufacturers,
  profiles,
  qualificationCards,
  trainers,
} from "../../db/schema";
import { loadEmployeeProfile } from "../../modules/directory/employee-profile-data";
import { getIssuedCertificateBySerial } from "../../modules/certification/queries";
import { encryptNationalId, hashNationalId } from "../../modules/platform/security/national-id";
import type { AuthContext } from "../../modules/platform/auth/shared";

// An auditor asking "what does this technician hold" needs the cards as well
// as the certificates. They are listed separately, never merged: conflating
// them would imply GCC Lab stands behind a card it did not print, and the two
// answer different questions at a site gate.
describe("cards on the employee profile", () => {
  const suffix = randomUUID().slice(0, 8);
  const auditorId = randomUUID();
  const auditorCtx: AuthContext = { userId: auditorId, role: "auditor", companyId: null, trainerId: null, region: null, aal: "aal2" };

  let companyId: number;
  let employeeId: number;
  let classId: number;
  let manufacturerId: number;
  const CARD_NUMBER = `CJ-${suffix}`;

  beforeAll(async () => {
    await db.execute(sql`insert into auth.users (id, email) values (${auditorId}, ${`dir-${suffix}@example.test`})`);
    await db.insert(profiles).values({ userId: auditorId, role: "auditor", fullName: "Directory Auditor" });

    const [company] = await db
      .insert(companies)
      .values({
        name: `Directory Co ${suffix}`,
        crNumber: `CR-DR-${suffix}`,
        contactName: "Contact",
        contactEmail: `dr-${suffix}@example.test`,
        contactPhone: "0500000008",
        contractorCategory: "Distribution",
        ownerUserId: auditorId,
      })
      .returning({ id: companies.id });
    companyId = company.id;

    const [maker] = await db
      .insert(manufacturers)
      .values({ name: `Dir Maker ${suffix}`, contactEmail: `dm-${suffix}@example.test` })
      .returning({ id: manufacturers.id });
    manufacturerId = maker.id;

    const [course] = await db.select({ id: courses.id }).from(courses).where(eq(courses.code, "CTCT10"));
    const [trainer] = await db
      .insert(trainers)
      .values({ fullName: `Dir Evaluator ${suffix}`, email: `de-${suffix}@example.test` })
      .returning({ id: trainers.id });
    const [cls] = await db
      .insert(classes)
      .values({
        courseId: course.id,
        trainerId: trainer.id,
        manufacturerId,
        region: "Central",
        type: "public",
        startDate: "2025-11-13",
        endDate: "2025-11-13",
        sessions: [],
        capacity: 10,
        status: "completed",
      })
      .returning({ id: classes.id });
    classId = cls.id;

    const [role] = await db.select({ id: jobRoles.id }).from(jobRoles).where(eq(jobRoles.code, "D07"));
    const nid = `2${Math.floor(Math.random() * 1e9)}`.padEnd(10, "0");
    const [employee] = await db
      .insert(employees)
      .values({
        companyId,
        fullNameEn: "Directory Technician",
        fullNameAr: "فني",
        nationalIdEnc: encryptNationalId(nid),
        nationalIdHash: hashNationalId(nid),
        jobRoleId: role.id,
        status: "active",
      })
      .returning({ id: employees.id });
    employeeId = employee.id;

    await db.insert(qualificationCards).values({
      employeeId,
      courseId: course.id,
      classId,
      companyId,
      manufacturerId,
      status: "collected",
      issuanceType: "renewal",
      testDate: "2025-11-13",
      expiresAt: "2027-11-13",
      cardNumber: CARD_NUMBER,
      eligibility: {},
    });
  });

  afterAll(async () => {
    await db.delete(qualificationCards).where(eq(qualificationCards.companyId, companyId));
    await db.delete(classes).where(eq(classes.id, classId));
    await db.delete(employees).where(eq(employees.id, employeeId));
    await db.delete(companies).where(eq(companies.id, companyId));
    await db.delete(manufacturers).where(eq(manufacturers.id, manufacturerId));
    await db.delete(profiles).where(eq(profiles.userId, auditorId));
    await db.execute(sql`delete from auth.users where id = ${auditorId}`);
  });

  it("shows an auditor the card, with the manufacturer named", async () => {
    const profile = await loadEmployeeProfile(auditorCtx, employeeId);
    expect(profile).not.toBeNull();
    expect(profile!.cards).toHaveLength(1);
    expect(profile!.cards[0].cardNumber).toBe(CARD_NUMBER);
    // Whose credential it is has to be on the page, not inferred.
    expect(profile!.cards[0].manufacturerName).toBe(`Dir Maker ${suffix}`);
    expect(profile!.cards[0].issuanceType).toBe("renewal");
  });

  it("counts cards separately from certificates", async () => {
    // A single "valid" number would hide which credential a technician is
    // actually short of. This one holds a card and no certificate.
    const profile = await loadEmployeeProfile(auditorCtx, employeeId);
    expect(profile!.progress.cards_valid).toBe(1);
    expect(profile!.progress.cards_expired).toBe(0);
    expect(profile!.progress.valid, "certificates, which this technician has none of").toBe(0);
    expect(profile!.certificates).toHaveLength(0);
  });

  it("keeps the card out of the public verification page", async () => {
    // The page's promise is that a serial it recognises was issued by GCC Lab.
    // A card number is not a serial and must find nothing — separate tables is
    // what makes that structurally true rather than a filter someone could
    // later remove.
    await expect(getIssuedCertificateBySerial(CARD_NUMBER)).resolves.toBeNull();
  });
});
