import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../../db";
import { courses, pricing } from "../../db/schema";
import { withRole } from "./with-role";

// Phase 5 acceptance criteria: "pricing rows unreadable by non-super_admin/
// non-platform_admin at the DB (test, references Phase 4.5's RLS)".
// Phase 2's catalog-pricing-write-denial.test.ts already proves WRITE
// denial for pricing; this proves SELECT denial specifically, which wasn't
// tested until now — contractors must never see raw pricing rows (they only
// ever see the computed total on their own request).
describe("RLS — pricing rows unreadable by contractor_manager/trainer", () => {
  const suffix = randomUUID().slice(0, 8);
  let courseId: number;
  let pricingId: number;

  beforeAll(async () => {
    const [course] = await db
      .insert(courses)
      .values({ code: `PRICING-READ-${suffix}`, titleEn: "Pricing Read Test", titleAr: "دورة", durationHours: "8" })
      .returning({ id: courses.id });
    courseId = course.id;

    const [price] = await db
      .insert(pricing)
      .values({ courseId, price: "500.00", effectiveFrom: "2020-01-01" })
      .returning({ id: pricing.id });
    pricingId = price.id;
  });

  afterAll(async () => {
    await db.delete(pricing).where(sql`id = ${pricingId}`);
    await db.delete(courses).where(sql`id = ${courseId}`);
  });

  it("contractor_manager gets zero rows on pricing SELECT", async () => {
    const rows = await withRole(
      { sub: randomUUID(), role: "authenticated", user_role: "contractor_manager", company_id: 1 },
      (tx) => tx.select().from(pricing).where(sql`id = ${pricingId}`)
    );
    expect(rows).toHaveLength(0);
  });

  it("trainer gets zero rows on pricing SELECT", async () => {
    const rows = await withRole({ sub: randomUUID(), role: "authenticated", user_role: "trainer", trainer_id: 1 }, (tx) =>
      tx.select().from(pricing).where(sql`id = ${pricingId}`)
    );
    expect(rows).toHaveLength(0);
  });

  it("platform_admin CAN read pricing (needed for the approval-time override)", async () => {
    const rows = await withRole({ sub: randomUUID(), role: "authenticated", user_role: "platform_admin" }, (tx) =>
      tx.select().from(pricing).where(sql`id = ${pricingId}`)
    );
    expect(rows).toHaveLength(1);
  });

  it("super_admin CAN read pricing (catalog/pricing is its one blanket scope)", async () => {
    const rows = await withRole({ sub: randomUUID(), role: "authenticated", user_role: "super_admin" }, (tx) =>
      tx.select().from(pricing).where(sql`id = ${pricingId}`)
    );
    expect(rows).toHaveLength(1);
  });
});
