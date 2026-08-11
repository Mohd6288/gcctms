import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "../../db";
import { assessmentScores, cardDispatches, courses, manufacturers, qualificationCards } from "../../db/schema";

// The Power Cable Joint and Termination tests award a card printed by the
// cable-accessory manufacturer, not a certificate this platform issues.
//
// Eight of them: joint and termination are separate tests with their own code,
// day and price. The catalog carried only the even codes under a combined
// "Joint and Termination" title, and its gaps were exactly the odd ones —
// CTCT07/09/11/13 — which is what GCC Lab's own price list uses for the
// termination halves (0039).
//
// The even codes are rows that ALREADY existed from the SEC training matrix.
// An earlier draft seeded duplicates under CBLT-* codes, which would have
// split each technician's cable history across two course ids and made every
// report on it quietly wrong. The first test below is what catches that.
const CABLE_COURSES = ["CTCT06", "CTCT07", "CTCT08", "CTCT09", "CTCT10", "CTCT11", "CTCT12", "CTCT13"];
const PRICED = ["CTCT06", "CTCT07", "CTCT08", "CTCT09", "CTCT10", "CTCT11"];

describe("manufacturer-issued cards — catalog", () => {
  it("awards cards from the existing courses, with no duplicate rows", async () => {
    const cardCourses = await db.select().from(courses).where(eq(courses.outcome, "card"));
    expect(cardCourses.map((c) => c.code).sort()).toEqual(CABLE_COURSES);

    // No second row anywhere carrying the same programme under another code.
    const byTitle = await db.select({ code: courses.code, title: courses.titleEn }).from(courses);
    const cableTitled = byTitle.filter((c) => /power cable joint/i.test(c.title));
    expect(cableTitled).toHaveLength(8);
  });

  it("carries the Cable Technician Evaluation rubric, scored per item", async () => {
    const [course] = await db.select().from(courses).where(eq(courses.code, "CTCT10"));

    // The single most important field in this feature: an aggregate rule would
    // card a technician who cannot pass an insulation test.
    expect(course.rubric?.passRule).toBe("per_item");
    // ONE part per test — CTCT10 scores the joint, CTCT11 the termination.
    // Two parts here would mean the split never happened.
    expect(course.rubric?.parts.map((p) => p.code)).toEqual(["joint"]);
    expect(course.rubric?.criteria.map((c) => c.code)).toEqual([
      "safety",
      "preparation",
      "assembly",
      "skills",
      "insulation",
    ]);
    // Five marks per sitting, each out of 20 — one column of the paper form.
    expect(course.rubric?.criteria.every((c) => c.max === 20)).toBe(true);

    // The threshold lives on the course, not in the rubric, so there is one
    // number rather than two that can disagree.
    expect(course.passMark).toBe(70);
    expect(course.examRequired).toBe(true);
    // ارشادات حضور الاختبارات: the card lasts two years from the test date.
    expect(course.validityMonths).toBe(24);
  });

  it("keeps the entry rules those courses already had", async () => {
    // Changing what a course awards must not quietly drop the job-role
    // restriction, the prerequisite or the pricing that came from the SEC
    // matrix — losing the job-role rows in particular would silently open the
    // course to every trade, because zero eligible roles means unrestricted.
    const rows = await db
      .select({ id: courses.id, code: courses.code })
      .from(courses)
      .where(inArray(courses.code, CABLE_COURSES));

    for (const row of rows) {
      const roles = await db.query.courseJobRoles.findMany({ where: (t, { eq: e }) => e(t.courseId, row.id) });
      const prereqs = await db.query.coursePrerequisites.findMany({ where: (t, { eq: e }) => e(t.courseId, row.id) });
      expect(roles.length, `${row.code} eligible job roles`).toBeGreaterThan(0);
      expect(prereqs.length, `${row.code} prerequisites`).toBeGreaterThan(0);
    }
  });

  it("prices the six GCC Lab has priced at 695 nationally, and shows nothing for the rest", async () => {
    // A flat national price, not the regional 450–1,100 inherited from a
    // training day-rate formula that never described these tests.
    for (const code of PRICED) {
      const [course] = await db.select({ id: courses.id }).from(courses).where(eq(courses.code, code));
      const active = await db.query.pricing.findMany({
        where: (t, { eq: e, and: a, or: o, isNull: n, gt: g }) =>
          a(e(t.courseId, course.id), o(n(t.effectiveTo), g(t.effectiveTo, new Date().toISOString().slice(0, 10)))),
      });
      expect(active, `${code} active prices`).toHaveLength(1);
      expect(active[0].region, `${code} must be national`).toBeNull();
      expect(Number(active[0].price)).toBe(695);
    }

    // 69KV has no confirmed price. Showing the old training figure would be
    // inventing one, so it carries none — an admin enters the amount at
    // approval via the existing unit-price override.
    for (const code of ["CTCT12", "CTCT13"]) {
      const [course] = await db.select({ id: courses.id }).from(courses).where(eq(courses.code, code));
      const active = await db.query.pricing.findMany({
        where: (t, { eq: e, and: a, or: o, isNull: n, gt: g }) =>
          a(e(t.courseId, course.id), o(n(t.effectiveTo), g(t.effectiveTo, new Date().toISOString().slice(0, 10)))),
      });
      expect(active, `${code} should have no active price`).toHaveLength(0);
    }
  });

  it("leaves every other course awarding a certificate", async () => {
    const certified = await db.select().from(courses).where(eq(courses.outcome, "certificate"));
    expect(certified.length).toBeGreaterThan(40);
    expect(certified.every((c) => c.rubric === null)).toBe(true);
  });

  it("has the new tables addressable through Drizzle", async () => {
    // Selecting every column proves the TS names match the real ones; tsc is
    // perfectly happy with a column that exists nowhere.
    await expect(db.select().from(manufacturers)).resolves.toBeInstanceOf(Array);
    await expect(db.select().from(assessmentScores)).resolves.toBeInstanceOf(Array);
    await expect(db.select().from(qualificationCards)).resolves.toBeInstanceOf(Array);
    await expect(db.select().from(cardDispatches)).resolves.toBeInstanceOf(Array);
  });
});
