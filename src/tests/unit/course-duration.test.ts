import { describe, expect, it } from "vitest";
import { addDays, courseDurationDays, endDateFor } from "../../lib/course-duration";

// Picking a start date fills the end date from the course's contact hours.
// The off-by-one here is the whole point: a one-day course ends the day it
// starts, and getting that wrong shows up on every single-day class.
describe("course duration → calendar dates", () => {
  it("maps contact hours to training days", () => {
    expect(courseDurationDays("8")).toBe(1);
    expect(courseDurationDays("16")).toBe(2);
    expect(courseDurationDays("24")).toBe(3);
    // Part-days round up — a 4-hour course still occupies a day.
    expect(courseDurationDays("4")).toBe(1);
    expect(courseDurationDays("12")).toBe(2);
    // Garbage in the column must not produce NaN dates in the form.
    expect(courseDurationDays("")).toBe(1);
    expect(courseDurationDays("0")).toBe(1);
  });

  it("ends a one-day course on the day it starts", () => {
    expect(endDateFor("2026-03-01", "8")).toBe("2026-03-01");
    expect(endDateFor("2026-03-01", "16")).toBe("2026-03-02");
    expect(endDateFor("2026-03-01", "40")).toBe("2026-03-05");
  });

  it("crosses months, years and leap days without drifting", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29"); // 2028 is a leap year
    expect(endDateFor("2026-02-27", "24")).toBe("2026-03-01");
  });

  it("returns nothing when no start date has been picked yet", () => {
    expect(endDateFor("", "8")).toBe("");
  });
});
