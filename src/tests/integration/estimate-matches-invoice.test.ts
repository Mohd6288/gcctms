import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import { courses, pricing } from "../../db/schema";
import { listEffectiveCoursePrices } from "../../modules/requests/queries";

// The wizard shows an estimate; approveRequest resolves the real unit price
// with its own SQL. If those two disagree the contractor is quoted one
// number and invoiced another, which is worse than showing nothing — so this
// pins the estimate to the same precedence rules: a region-specific row
// beats a region-null default, and the latest effective_from wins.
describe("contractor price estimate resolves like the invoice does", () => {
  const suffix = randomUUID().slice(0, 8);
  let courseId: number;

  beforeAll(async () => {
    const [course] = await db
      .insert(courses)
      .values({ code: `EST-${suffix}`, titleEn: "Estimate Course", titleAr: "دورة", durationHours: "8" })
      .returning({ id: courses.id });
    courseId = course.id;

    await db.insert(pricing).values([
      // a region-null default, and an East-specific row that must shadow it
      { courseId, region: null, price: "400.00", effectiveFrom: "2020-01-01" },
      { courseId, region: "East", price: "450.00", effectiveFrom: "2020-01-01" },
      // a newer East row that must win over the older one
      { courseId, region: "East", price: "900.00", effectiveFrom: "2020-06-01" },
      // a future row that must NOT be picked up yet
      { courseId, region: "Central", price: "9999.00", effectiveFrom: "2999-01-01" },
    ]);
  });

  afterAll(async () => {
    await db.delete(pricing).where(eq(pricing.courseId, courseId));
    await db.delete(courses).where(eq(courses.id, courseId));
  });

  it("prefers a region row over the region-null default, and the latest effective row", async () => {
    const prices = await listEffectiveCoursePrices([courseId]);
    const forRegion = (region: string | null) => prices.find((p) => p.courseId === courseId && p.region === region)?.price;

    expect(forRegion("East")).toBe("900.00");
    expect(forRegion(null)).toBe("400.00");
    // Not yet effective, so it must not appear at all.
    expect(forRegion("Central")).toBeUndefined();
  });

  it("agrees with the price approveRequest would invoice", async () => {
    // Exactly the query in resolvePrice() (requests/service.ts).
    const invoiced = (await db.execute(sql`
      select price from pricing
      where course_id = ${courseId}
        and (region = 'East' or region is null)
        and effective_from <= current_date
        and (effective_to is null or effective_to >= current_date)
      order by region nulls last, effective_from desc
      limit 1
    `)) as unknown as Array<{ price: string }>;

    const estimate = (await listEffectiveCoursePrices([courseId])).find((p) => p.region === "East");
    expect(estimate?.price).toBe(invoiced[0].price);
  });

  it("returns price as a string, so nothing multiplies it by accident", async () => {
    const [row] = await listEffectiveCoursePrices([courseId]);
    expect(typeof row.price).toBe("string");
  });
});
