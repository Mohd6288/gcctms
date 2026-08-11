import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import { companies, coursePrerequisites, courses, documents, employees, jobRoles } from "../../db/schema";
import { employeesSatisfyingPrerequisites, getPrerequisiteGroups } from "../../modules/catalog/queries";
import { encryptNationalId, hashNationalId } from "../../modules/platform/security/national-id";
import { grantPriorCertificate } from "../helpers/ohs-induction";

// GCC Lab's rule: a technician sits a technical certification test only if
// they hold FOUR certificates —
//
//   Safe Working Procedures for the test's discipline  (CSCC02 / CSCC03 / CSCC08)
//   OHS General Induction                              (CSCC00)
//   Basic Fire Fighting                                (CSCC21)
//   Basic First Aid                                    (CSCC22)
//
// The induction is not a course_prerequisites row: getPrerequisiteGroups()
// appends it to every course, because SEC's rule is that nobody trains at all
// without it. It is still one of the four and is asserted here.
//
// Before 0039 course_prerequisites could not express an AND at all. Every
// listed prerequisite went into one group, and a group is satisfied by holding
// any single course in it — so the set would have admitted a technician
// holding Basic First Aid and nothing else. These tests exist because that
// failure mode is invisible: the rows look right, the gate runs, and the wrong
// people pass.
const INDUCTION = "CSCC00";
const FOUR = ["CSCC02", INDUCTION, "CSCC21", "CSCC22"];

describe("technical test entry requirements", () => {
  const suffix = randomUUID().slice(0, 8);
  const verifier = randomUUID();
  let companyId: number;
  let cableTestId: number;

  beforeAll(async () => {
    const [cable] = await db.select({ id: courses.id }).from(courses).where(eq(courses.code, "CTCT10"));
    cableTestId = cable.id;

    // companies.owner_user_id is a real FK onto auth.users.
    await db.execute(sql`insert into auth.users (id, email) values (${verifier}, ${`entry-${suffix}@example.test`})`);

    const [company] = await db
      .insert(companies)
      .values({
        name: `Entry Reqs ${suffix}`,
        crNumber: `CR-${suffix}`,
        contactName: "Test Contact",
        contactEmail: `entry-${suffix}@example.test`,
        contactPhone: "0500000000",
        contractorCategory: "Distribution",
        ownerUserId: verifier,
      })
      .returning({ id: companies.id });
    companyId = company.id;
  });

  afterAll(async () => {
    if (companyId == null) return;
    await db.delete(documents).where(eq(documents.companyId, companyId));
    await db.delete(employees).where(eq(employees.companyId, companyId));
    await db.delete(companies).where(eq(companies.id, companyId));
    await db.execute(sql`delete from auth.users where id = ${verifier}`);
  });

  async function makeTechnician(name: string, holding: string[]) {
    const [role] = await db.select({ id: jobRoles.id }).from(jobRoles).where(eq(jobRoles.code, "D07"));
    const nid = `2${Math.floor(Math.random() * 1e9)}`.padEnd(10, "0");
    const [employee] = await db
      .insert(employees)
      .values({
        companyId,
        fullNameEn: name,
        fullNameAr: name,
        nationalIdEnc: encryptNationalId(nid),
        nationalIdHash: hashNationalId(nid),
        jobRoleId: role.id,
        status: "active",
      })
      .returning({ id: employees.id });

    // Granted the way a contractor really does it — an uploaded external
    // certificate an admin has verified. An internally-issued certificate
    // would need a class, a trainer and an enrollment first.
    for (const code of holding) {
      await grantPriorCertificate(companyId, employee.id, code, verifier);
    }
    return employee.id;
  }

  it("groups the four certificates so each must be held separately", async () => {
    const groups = await getPrerequisiteGroups(cableTestId);
    // One group per requirement: Safe Working Procedures, Fire Fighting,
    // First Aid, and the induction the platform appends to every course. If
    // this ever collapses toward one group, the AND is gone and any single
    // certificate would admit a technician.
    expect(groups.length).toBe(4);
    expect(groups.every((g) => g.length >= 1)).toBe(true);
  });

  it("refuses a technician holding only one of the four", async () => {
    const onlyFirstAid = await makeTechnician("Only First Aid", ["CSCC22", INDUCTION]);
    const satisfied = await employeesSatisfyingPrerequisites([onlyFirstAid], cableTestId);
    expect(satisfied.has(onlyFirstAid)).toBe(false);
  });

  it("refuses a technician holding three of the four", async () => {
    const threeOfFour = await makeTechnician("Three of Four", ["CSCC02", "CSCC21", INDUCTION]);
    const satisfied = await employeesSatisfyingPrerequisites([threeOfFour], cableTestId);
    expect(satisfied.has(threeOfFour), "missing Basic First Aid").toBe(false);
  });

  it("admits a technician holding all four", async () => {
    const complete = await makeTechnician("Complete", FOUR);
    const satisfied = await employeesSatisfyingPrerequisites([complete], cableTestId);
    expect(satisfied.has(complete)).toBe(true);
  });

  it("still refuses without the OHS General Induction", async () => {
    const noInduction = await makeTechnician("No Induction", FOUR.filter((c) => c !== INDUCTION));
    const satisfied = await employeesSatisfyingPrerequisites([noInduction], cableTestId);
    expect(satisfied.has(noInduction)).toBe(false);
  });

  it("never demands a Safe Working Procedures course from the wrong side", async () => {
    // 0040 nearly shipped a gate no Distribution technician could pass. It
    // added "the discipline's SWP" as its own OR group of CSCC02 + CSCC08,
    // trusting the unique index to skip whichever was already required. For a
    // Distribution test that already listed CSCC02, only CSCC02 was skipped —
    // leaving CSCC08, the Transmission-only NG procedures course, alone in a
    // group of its own and therefore mandatory.
    const tests = await db
      .select({ id: courses.id, code: courses.code, category: courses.contractorCategory })
      .from(courses)
      .where(eq(courses.outcome, "card"));

    for (const test of tests) {
      if (test.category !== "Distribution") continue;
      const groups = await getPrerequisiteGroups(test.id);
      const [ng] = await db.select({ id: courses.id }).from(courses).where(eq(courses.code, "CSCC08"));
      // CSCC08 may appear as one option among others; it must never be the
      // only way to satisfy a group.
      const forcesNg = groups.some((g) => g.length === 1 && g[0] === ng.id);
      expect(forcesNg, `${test.code} forces the Transmission-only CSCC08`).toBe(false);
    }
  });

  it("no longer demands the duplicate Basic Fire Fighting code", async () => {
    // CSCC24 carries the same title as CSCC21 under contractor_category
    // 'Transmission'. It is a duplicate row, not a category variant, and
    // CSCC21 is already visible to every company — so no test should reference
    // it and it should not appear in any catalog.
    const [cscc24] = await db.select({ id: courses.id, active: courses.active })
      .from(courses).where(eq(courses.code, "CSCC24"));
    expect(cscc24.active).toBe(false);

    const cards = await db.select({ id: courses.id }).from(courses).where(eq(courses.outcome, "card"));
    for (const card of cards) {
      const groups = await getPrerequisiteGroups(card.id);
      expect(groups.flat()).not.toContain(cscc24.id);
    }
  });

  it("leaves ordinary courses behaving exactly as before", async () => {
    // Everything seeded before 0039 sits in group 1, so a course with several
    // listed prerequisites is still satisfied by holding any one of them.
    const [ohsRep] = await db.select({ id: courses.id }).from(courses).where(eq(courses.code, "CSCC13"));
    const groups = await getPrerequisiteGroups(ohsRep.id);
    const listed = await db
      .select({ groupNo: coursePrerequisites.groupNo })
      .from(coursePrerequisites)
      .where(eq(coursePrerequisites.courseId, ohsRep.id));
    expect(listed.every((r) => r.groupNo === 1)).toBe(true);
    // At most its own single group plus the induction.
    expect(groups.length).toBeLessThanOrEqual(2);
  });
});
