import { describe, expect, it } from "vitest";
import type { Rubric } from "../../db/schema";
import { requiredMark, scoreRubric } from "../../modules/assessment/score";

// The Cable Technician Evaluation, as seeded on CTCT06–CTCT13: one part, five
// criteria at 20 each, and a card only where the technician reaches 70% in
// EVERY item.
const CABLE: Rubric = {
  passRule: "per_item",
  parts: [{ code: "joint", en: "Splicing / Joint Test", ar: "اختبار الوصل" }],
  criteria: [
    { code: "safety", max: 20, en: "Safety terms", ar: "" },
    { code: "preparation", max: 20, en: "Cable preparation", ar: "" },
    { code: "assembly", max: 20, en: "Assembly", ar: "" },
    { code: "skills", max: 20, en: "Technician skills", ar: "" },
    { code: "insulation", max: 20, en: "Insulation test", ar: "" },
  ],
};

const marks = (...scores: number[]) =>
  scores.map((score, i) => ({ partCode: "joint", criterionCode: CABLE.criteria[i].code, score }));

describe("scoreRubric — the per-item rule", () => {
  // The case this whole feature exists for. An aggregate rule would card a
  // technician who cannot pass an insulation test.
  it("fails a strong sitting with one weak criterion", () => {
    const outcome = scoreRubric(CABLE, 70, marks(18, 16, 19, 17, 10));

    expect(outcome.result).toBe("fail");
    expect(outcome.total).toBe(80);
    expect(outcome.percent).toBe(80);
    expect(outcome.failures).toHaveLength(1);
    // Naming the criterion is the point: "fail" alone tells an evaluator
    // nothing about what to tell the technician.
    expect(outcome.failures[0]).toMatchObject({ criterionCode: "insulation", score: 10, required: 14 });
  });

  it("passes when every criterion sits exactly on the threshold", () => {
    // 14 of 20 is exactly 70%. Computed with integers precisely so this
    // boundary is not a floating-point coin toss.
    const outcome = scoreRubric(CABLE, 70, marks(14, 14, 14, 14, 14));
    expect(outcome.result).toBe("pass");
    expect(outcome.failures).toEqual([]);
    expect(outcome.percent).toBe(70);
  });

  it("fails one mark below the threshold", () => {
    const outcome = scoreRubric(CABLE, 70, marks(14, 14, 13, 14, 14));
    expect(outcome.result).toBe("fail");
    expect(outcome.failures.map((f) => f.criterionCode)).toEqual(["assembly"]);
  });

  it("passes a full sheet with room to spare", () => {
    const outcome = scoreRubric(CABLE, 70, marks(20, 20, 20, 20, 20));
    expect(outcome.result).toBe("pass");
    expect(outcome.total).toBe(100);
  });

  it("names every failing criterion, not just the first", () => {
    const outcome = scoreRubric(CABLE, 70, marks(10, 20, 9, 20, 20));
    expect(outcome.result).toBe("fail");
    expect(outcome.failures.map((f) => f.criterionCode)).toEqual(["safety", "assembly"]);
  });
});

describe("scoreRubric — sittings that cannot be judged", () => {
  it("is incomplete, never a fail, when a mark is missing", () => {
    // Treating a half-filled sheet as a fail would record a failure nobody
    // assessed — and the technician would have to sit the test again.
    const outcome = scoreRubric(CABLE, 70, marks(20, 20, 20, 20).slice(0, 4));
    expect(outcome.result).toBe("incomplete");
    expect(outcome.missing).toEqual([{ partCode: "joint", criterionCode: "insulation" }]);
    expect(outcome.failures).toEqual([]);
  });

  it("is incomplete when nothing has been entered yet", () => {
    const outcome = scoreRubric(CABLE, 70, []);
    expect(outcome.result).toBe("incomplete");
    expect(outcome.missing).toHaveLength(5);
    expect(outcome.total).toBe(0);
  });

  it("rejects a mark above the criterion's maximum instead of clamping it", () => {
    // Silently clamping 25 to 20 would file a mark the evaluator never gave.
    const outcome = scoreRubric(CABLE, 70, marks(25, 20, 20, 20, 20));
    expect(outcome.result).toBe("incomplete");
    expect(outcome.invalid).toEqual([{ partCode: "joint", criterionCode: "safety", score: 25, max: 20 }]);
    // And the impossible mark is not counted toward the total.
    expect(outcome.total).toBe(80);
  });

  it("rejects a negative mark", () => {
    const outcome = scoreRubric(CABLE, 70, marks(-1, 20, 20, 20, 20));
    expect(outcome.result).toBe("incomplete");
    expect(outcome.invalid).toHaveLength(1);
  });
});

describe("scoreRubric — more than one part", () => {
  // Joint and termination are separate tests today, but the shape supports a
  // rubric that scores both in one sitting, and the per-item rule has to hold
  // across every part rather than within each.
  const TWO_PART: Rubric = {
    ...CABLE,
    parts: [
      { code: "joint", en: "Joint", ar: "" },
      { code: "termination", en: "Termination", ar: "" },
    ],
  };

  const full = (joint: number, termination: number) =>
    TWO_PART.parts.flatMap((part) =>
      TWO_PART.criteria.map((c) => ({
        partCode: part.code,
        criterionCode: c.code,
        score: part.code === "joint" ? joint : termination,
      }))
    );

  it("fails when the weak criterion is in the second part", () => {
    const outcome = scoreRubric(TWO_PART, 70, [
      ...full(20, 20).slice(0, 9),
      { partCode: "termination", criterionCode: "insulation", score: 10 },
    ]);
    expect(outcome.result).toBe("fail");
    expect(outcome.max).toBe(200);
    expect(outcome.failures[0]).toMatchObject({ partCode: "termination", criterionCode: "insulation" });
  });

  it("requires every cell of every part", () => {
    const outcome = scoreRubric(TWO_PART, 70, full(20, 20).slice(0, 5));
    expect(outcome.result).toBe("incomplete");
    expect(outcome.missing).toHaveLength(5);
  });
});

describe("scoreRubric — the aggregate rule", () => {
  // Unused by the cable tests, but the field exists and a future test may want
  // it; leaving it unimplemented would be a trap for whoever configures one.
  const AGGREGATE: Rubric = { ...CABLE, passRule: "aggregate" };

  it("passes on the total, even with a weak criterion", () => {
    const outcome = scoreRubric(AGGREGATE, 70, marks(18, 16, 19, 17, 10));
    expect(outcome.result).toBe("pass");
    expect(outcome.percent).toBe(80);
    // Still reported, so a screen can show which item was weak even where it
    // does not decide the outcome.
    expect(outcome.failures.map((f) => f.criterionCode)).toEqual(["insulation"]);
  });

  it("fails on the total", () => {
    const outcome = scoreRubric(AGGREGATE, 70, marks(13, 13, 13, 13, 13));
    expect(outcome.result).toBe("fail");
    expect(outcome.total).toBe(65);
  });
});

describe("requiredMark", () => {
  it("is 14 of 20 at 70%", () => {
    expect(requiredMark(20, 70)).toBe(14);
  });

  it("rounds up, so the threshold is never quietly lowered", () => {
    // 70% of 25 is 17.5; accepting 17 would pass someone at 68%.
    expect(requiredMark(25, 70)).toBe(18);
  });
});
