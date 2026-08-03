import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../../db";
import { courses, pricing } from "../../db/schema";
import { withRole } from "./with-role";

// Phase 2 acceptance criteria: "pricing and catalog capabilities denied to
// everyone except super_admin at both authorize() and RLS levels" and
// "platform_admin confirmed unable to write courses/exams/pricing
// (read-only where the matrix says so)". authorize()'s side is
// tests/unit/authorize.test.ts; this file is the RLS side, proven against
// the real database.
describe("RLS — catalog/pricing writes are super_admin-only", () => {
  const suffix = randomUUID().slice(0, 8);
  let courseId: number;

  beforeAll(async () => {
    const [course] = await db
      .insert(courses)
      .values({ code: `WRITE-DENY-${suffix}`, titleEn: "Write Denial Course", titleAr: "دورة اختبار", durationHours: "8" })
      .returning({ id: courses.id });
    courseId = course.id;
  });

  afterAll(async () => {
    await db.delete(pricing).where(sql`course_id = ${courseId}`);
    await db.delete(courses).where(sql`id = ${courseId}`);
  });

  const nonSuperAdminRoles = [
    { user_role: "platform_admin" },
    { user_role: "contractor_manager", company_id: 1 },
    { user_role: "trainer", trainer_id: 1 },
  ];

  for (const claims of nonSuperAdminRoles) {
    it(`${claims.user_role} is denied INSERT on courses`, async () => {
      await expect(
        withRole({ sub: randomUUID(), role: "authenticated", ...claims }, (tx) =>
          tx.insert(courses).values({ code: `SHOULD-FAIL-${suffix}-${claims.user_role}`, titleEn: "x", titleAr: "x", durationHours: "1" })
        )
      ).rejects.toMatchObject({ cause: { code: "42501" } });
    });

    it(`${claims.user_role} is denied UPDATE on courses (read-only, not invisible)`, async () => {
      // First confirm the row IS visible (catalog is readable by every
      // authenticated role) — the write denial below is meaningful only
      // because the row isn't hidden by RLS entirely.
      const visible = await withRole({ sub: randomUUID(), role: "authenticated", ...claims }, (tx) =>
        tx.select().from(courses).where(sql`id = ${courseId}`)
      );
      expect(visible).toHaveLength(1);

      // No UPDATE policy matches this role -> RLS silently filters the
      // update's target set to zero rows (not an error, since
      // courses_select_all still lets the WHERE clause see the row).
      const updated = await withRole({ sub: randomUUID(), role: "authenticated", ...claims }, (tx) =>
        tx.update(courses).set({ titleEn: "hacked" }).where(sql`id = ${courseId}`).returning()
      );
      expect(updated).toHaveLength(0);
    });

    it(`${claims.user_role} is denied INSERT on pricing`, async () => {
      await expect(
        withRole({ sub: randomUUID(), role: "authenticated", ...claims }, (tx) =>
          tx.insert(pricing).values({ courseId, price: "999.00", effectiveFrom: "2026-01-01" })
        )
      ).rejects.toMatchObject({ cause: { code: "42501" } });
    });
  }

  it("super_admin CAN write courses and pricing", async () => {
    const claims = { sub: randomUUID(), role: "authenticated", user_role: "super_admin" };

    const inserted = await withRole(claims, (tx) =>
      tx
        .update(courses)
        .set({ titleEn: "Updated by super_admin" })
        .where(sql`id = ${courseId}`)
        .returning({ id: courses.id })
    );
    expect(inserted).toHaveLength(1);

    const pricingRow = await withRole(claims, (tx) =>
      tx.insert(pricing).values({ courseId, price: "500.00", effectiveFrom: "2026-01-01" }).returning({ id: pricing.id })
    );
    expect(pricingRow).toHaveLength(1);
  });
});
