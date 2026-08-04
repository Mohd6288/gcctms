import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import { courses } from "../../db/schema";

// Proves courses.code is NOT globally unique — real GCC Lab source data has
// the same code appear twice, once per contractor_category (e.g. CSCC10,
// CTCT01). See 0018_courses_code_category_unique.sql: a code may have at
// most one row per contractor_category, plus at most one category-agnostic
// (null) row — modeled as two partial unique indexes, not one plain
// composite constraint, since Postgres never treats two NULLs as equal.
describe("courses.code uniqueness — scoped by contractor_category, real DB", () => {
  const code = `DUAL-${randomUUID().slice(0, 8)}`;
  const createdIds: number[] = [];

  afterAll(async () => {
    if (createdIds.length > 0) {
      await db.delete(courses).where(sql`id in (${sql.join(createdIds, sql`, `)})`);
    }
  });

  it("allows the same code once for Distribution and once for Transmission", async () => {
    const [distribution] = await db
      .insert(courses)
      .values({ code, titleEn: "Dist course", titleAr: "دورة توزيع", durationHours: "8", contractorCategory: "Distribution" })
      .returning({ id: courses.id });
    createdIds.push(distribution.id);

    const [transmission] = await db
      .insert(courses)
      .values({ code, titleEn: "Trans course", titleAr: "دورة نقل", durationHours: "8", contractorCategory: "Transmission" })
      .returning({ id: courses.id });
    createdIds.push(transmission.id);

    expect(distribution.id).not.toBe(transmission.id);
  });

  it("allows the same code a third time with no category (category-agnostic)", async () => {
    const [universal] = await db
      .insert(courses)
      .values({ code, titleEn: "Universal course", titleAr: "دورة عامة", durationHours: "8" })
      .returning({ id: courses.id });
    createdIds.push(universal.id);
    expect(universal.id).toBeTypeOf("number");
  });

  it("rejects a true duplicate — same code, same category, at the database", async () => {
    await expect(
      db.insert(courses).values({ code, titleEn: "Duplicate", titleAr: "مكرر", durationHours: "8", contractorCategory: "Distribution" })
    ).rejects.toMatchObject({ cause: { code: "23505" } }); // Postgres unique_violation
  });

  it("rejects a true duplicate — same code, both null category, at the database", async () => {
    await expect(
      db.insert(courses).values({ code, titleEn: "Duplicate universal", titleAr: "مكرر عام", durationHours: "8" })
    ).rejects.toMatchObject({ cause: { code: "23505" } });
  });
});
