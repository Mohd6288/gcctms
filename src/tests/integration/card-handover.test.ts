import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import {
  cardDispatches,
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
import { dispatchPassList, recordCardCollection, recordCardIssuance } from "../../modules/cards/service";
import { GuardError } from "../../modules/platform/guard-error";
import { encryptNationalId, hashNationalId } from "../../modules/platform/security/national-id";
import type { AuthContext } from "../../modules/platform/auth/shared";

// Steps 9 and 10: tell the manufacturer who passed, then record the cards
// coming back and going out of the door.
//
// The gate that creates the card is covered in rubric-assessment.test.ts, so
// the card here is inserted directly — this is about what happens to it after.
describe("dispatching the pass list and handing over cards", () => {
  const suffix = randomUUID().slice(0, 8);
  const adminId = randomUUID();
  const adminCtx: AuthContext = { userId: adminId, role: "platform_admin", companyId: null, trainerId: null, region: null, aal: "aal2" };
  const IQAMA = "2375973399";

  let companyId: number;
  let classId: number;
  let manufacturerId: number;
  let cardId: number;

  beforeAll(async () => {
    await db.execute(sql`insert into auth.users (id, email) values (${adminId}, ${`cards-${suffix}@example.test`})`);
    await db.insert(profiles).values({ userId: adminId, role: "platform_admin", fullName: "Cards Admin" });

    const [company] = await db
      .insert(companies)
      .values({
        name: "TECHSEN COMPANY",
        crNumber: `CR-CD-${suffix}`,
        contactName: "Contact",
        contactEmail: `cd-${suffix}@example.test`,
        contactPhone: "0500000004",
        contractorCategory: "Distribution",
        ownerUserId: adminId,
      })
      .returning({ id: companies.id });
    companyId = company.id;

    // No contact email yet — the first assertion depends on it.
    const [maker] = await db
      .insert(manufacturers)
      .values({ name: `Cable Accessories Co ${suffix}` })
      .returning({ id: manufacturers.id });
    manufacturerId = maker.id;

    const [course] = await db.select({ id: courses.id }).from(courses).where(eq(courses.code, "CTCT10"));
    const [trainer] = await db
      .insert(trainers)
      .values({ fullName: `Evaluator ${suffix}`, email: `cdev-${suffix}@example.test` })
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
        locationNote: "Cable workshop – GCCLAB",
        status: "completed",
      })
      .returning({ id: classes.id });
    classId = cls.id;

    const [role] = await db.select({ id: jobRoles.id }).from(jobRoles).where(eq(jobRoles.code, "D07"));
    const [employee] = await db
      .insert(employees)
      .values({
        companyId,
        fullNameEn: "MOHAMMED AFZAL",
        fullNameAr: "محمد أفضل",
        nationalIdEnc: encryptNationalId(IQAMA),
        nationalIdHash: hashNationalId(IQAMA),
        jobRoleId: role.id,
        status: "active",
      })
      .returning({ id: employees.id });

    const [card] = await db
      .insert(qualificationCards)
      .values({
        employeeId: employee.id,
        courseId: course.id,
        classId,
        companyId,
        manufacturerId,
        status: "awaiting_issuer",
        testDate: "2025-11-13",
        eligibility: {},
      })
      .returning({ id: qualificationCards.id });
    cardId = card.id;
  });

  afterAll(async () => {
    await db.delete(cardDispatches).where(eq(cardDispatches.classId, classId));
    await db.delete(qualificationCards).where(eq(qualificationCards.companyId, companyId));
    await db.delete(classes).where(eq(classes.id, classId));
    await db.delete(employees).where(eq(employees.companyId, companyId));
    await db.delete(companies).where(eq(companies.id, companyId));
    await db.delete(manufacturers).where(eq(manufacturers.id, manufacturerId));
    await db.delete(profiles).where(eq(profiles.userId, adminId));
    await db.execute(sql`delete from auth.users where id = ${adminId}`);
  });

  it("refuses to send when the manufacturer has no contact email", async () => {
    // Better a refusal naming the gap than a workflow that reaches step 9 and
    // stalls with nobody realising the list was never sent.
    await expect(dispatchPassList(adminCtx, classId)).rejects.toThrow(/contact email/i);
  });

  it("sends the list, and stores only masked identifiers in the snapshot", async () => {
    await db
      .update(manufacturers)
      .set({ contactEmail: `printer-${suffix}@example.test` })
      .where(eq(manufacturers.id, manufacturerId));

    const result = await dispatchPassList(adminCtx, classId);
    expect(result.count).toBe(1);

    const [dispatch] = await db.select().from(cardDispatches).where(eq(cardDispatches.classId, classId));
    expect(dispatch.passCount).toBe(1);
    expect(dispatch.bucket).toBe("card-dispatches");
    expect(dispatch.linkExpiresAt.getTime()).toBeGreaterThan(Date.now());

    // The snapshot is kept as evidence of what was sent and lives in our own
    // database indefinitely — so it holds the masked form, not the full one.
    // The unmasked list exists only in the PDF behind the expiring link.
    const snapshot = JSON.stringify(dispatch.snapshot);
    expect(snapshot).toContain("MOHAMMED AFZAL");
    expect(snapshot, "the snapshot must not retain a full Iqama").not.toContain(IQAMA);
    expect(snapshot).toContain("3399");

    const [card] = await db.select().from(qualificationCards).where(eq(qualificationCards.id, cardId));
    expect(card.dispatchedAt).not.toBeNull();
  });

  it("refuses a second send, so nobody prints the same card twice", async () => {
    await expect(dispatchPassList(adminCtx, classId)).rejects.toThrow(/no cards awaiting/i);
  });

  it("will not hand over a card the manufacturer has not reported issued", async () => {
    await expect(
      recordCardCollection(adminCtx, { cardId, collectedByName: "A. Rahman", collectedByMobile: "0555000012" })
    ).rejects.toBeInstanceOf(GuardError);
  });

  it("dates the card two years from the TEST, not from the day it was printed", async () => {
    // The rule is "ومدتها عامين من تاريخ الاختبار". A card printed three weeks
    // late must not buy the technician three extra weeks of validity — which
    // is exactly what counting from today would do.
    await recordCardIssuance(adminCtx, { cardId, cardNumber: `CJ-${suffix}` });

    const [card] = await db.select().from(qualificationCards).where(eq(qualificationCards.id, cardId));
    expect(card.status).toBe("issued");
    expect(card.cardNumber).toBe(`CJ-${suffix}`);
    expect(card.expiresAt).toBe("2027-11-13");
  });

  it("records who physically collected it", async () => {
    // نموذج الغياب و استلام البطاقات — often the contractor's representative
    // rather than the technician, which is why the name and mobile are asked
    // for at all.
    await recordCardCollection(adminCtx, {
      cardId,
      collectedByName: "A. Rahman",
      collectedByMobile: "0555000012",
    });

    const [card] = await db.select().from(qualificationCards).where(eq(qualificationCards.id, cardId));
    expect(card.status).toBe("collected");
    expect(card.collectedByName).toBe("A. Rahman");
    expect(card.collectedByMobile).toBe("0555000012");
    expect(card.collectedAt).not.toBeNull();
  });

  it("refuses to record a collection twice", async () => {
    await expect(
      recordCardCollection(adminCtx, { cardId, collectedByName: "Someone else", collectedByMobile: "0555000099" })
    ).rejects.toBeInstanceOf(GuardError);
  });
});
