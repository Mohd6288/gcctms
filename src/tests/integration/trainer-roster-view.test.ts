import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import { courses, trainerCourses, trainers } from "../../db/schema";
import { listTrainerCourses, listTrainers } from "../../modules/catalog/queries";
import { updateTrainer } from "../../modules/catalog/service";
import type { AuthContext } from "../../modules/platform/auth/shared";

// Backs /admin/trainers: an admin scheduling a class needs to see who is
// qualified to teach what. The page joins these two queries in JS rather than
// aggregating in SQL, so what matters here is that every competency comes
// back keyed to its trainer — a dropped row silently narrows the roster an
// admin thinks they have.
describe("trainer roster view — real DB", () => {
  const suffix = randomUUID().slice(0, 8);
  let qualifiedId: number;
  let bareId: number;
  let courseIds: number[];

  beforeAll(async () => {
    const seeded = await db
      .insert(courses)
      .values([
        { code: `RV1-${suffix}`, titleEn: "Roster View One", titleAr: "عرض واحد", durationHours: "8" },
        { code: `RV2-${suffix}`, titleEn: "Roster View Two", titleAr: "عرض اثنان", durationHours: "8" },
      ])
      .returning({ id: courses.id });
    courseIds = seeded.map((c) => c.id);

    const inserted = await db
      .insert(trainers)
      .values([
        { fullName: `Qualified Trainer ${suffix}`, email: `qualified-${suffix}@example.com`, qualifications: "NEBOSH IGC", active: true },
        { fullName: `Bare Trainer ${suffix}`, email: `bare-${suffix}@example.com`, active: true },
      ])
      .returning({ id: trainers.id });
    qualifiedId = inserted[0].id;
    bareId = inserted[1].id;

    await db.insert(trainerCourses).values(courseIds.map((courseId) => ({ trainerId: qualifiedId, courseId })));
  });

  afterAll(async () => {
    await db.delete(trainerCourses).where(eq(trainerCourses.trainerId, qualifiedId));
    await db.delete(trainers).where(inArray(trainers.id, [qualifiedId, bareId]));
    await db.delete(courses).where(inArray(courses.id, courseIds));
  });

  it("returns every competency keyed to its trainer, and nothing for one with none", async () => {
    const rows = await listTrainerCourses();

    const mine = rows.filter((r) => r.trainerId === qualifiedId).map((r) => r.code).sort();
    expect(mine).toEqual([`RV1-${suffix}`, `RV2-${suffix}`]);
    expect(rows.filter((r) => r.trainerId === bareId)).toHaveLength(0);

    // Both titles travel with the row — the page shows the Arabic one on the
    // Arabic locale, and a missing one would render an empty tooltip.
    const [first] = rows.filter((r) => r.trainerId === qualifiedId);
    expect(first.titleEn).toBeTruthy();
    expect(first.titleAr).toBeTruthy();
  });

  // The super admin picks competencies from the catalog now, so updateTrainer
  // writes trainer_courses. Getting the "omitted" case wrong would wipe the
  // seeded roster's competencies every time someone renamed a trainer.
  it("replaces competencies when courseIds is given and leaves them alone when it is omitted", async () => {
    const superAdminId = randomUUID();
    await db.execute(sql`insert into auth.users (id) values (${superAdminId})`);
    const ctx: AuthContext = { userId: superAdminId, role: "super_admin", companyId: null, trainerId: null, region: null, aal: "aal2" };

    try {
      await updateTrainer(ctx, { trainerId: qualifiedId, fullName: `Qualified Trainer ${suffix}`, active: true, courseIds: [courseIds[0]] });
      expect((await listTrainerCourses()).filter((r) => r.trainerId === qualifiedId).map((r) => r.courseId)).toEqual([courseIds[0]]);

      // No courseIds key at all — a name-only edit must not clear the list.
      await updateTrainer(ctx, { trainerId: qualifiedId, fullName: `Renamed ${suffix}`, active: true });
      expect((await listTrainerCourses()).filter((r) => r.trainerId === qualifiedId)).toHaveLength(1);

      // An explicit empty array is a real instruction to clear them.
      await updateTrainer(ctx, { trainerId: qualifiedId, fullName: `Renamed ${suffix}`, active: true, courseIds: [] });
      expect((await listTrainerCourses()).filter((r) => r.trainerId === qualifiedId)).toHaveLength(0);

      await updateTrainer(ctx, { trainerId: qualifiedId, fullName: `Qualified Trainer ${suffix}`, qualifications: "NEBOSH IGC", active: true, courseIds });
    } finally {
      await db.execute(sql`delete from audit_log where user_id = ${superAdminId}`);
      await db.execute(sql`delete from auth.users where id = ${superAdminId}`);
    }
  });

  it("agrees with the course count listTrainers reports for the same trainer", async () => {
    const roster = await listTrainers();
    const qualified = roster.find((t) => t.id === qualifiedId);
    const bare = roster.find((t) => t.id === bareId);

    // courseCount is a raw ::int subselect; if it ever drifts from the join
    // the roster shows "2 courses" beside a single chip.
    expect(qualified?.courseCount).toBe(2);
    expect(bare?.courseCount).toBe(0);
    expect(qualified?.qualifications).toBe("NEBOSH IGC");
    expect(qualified?.email).toBe(`qualified-${suffix}@example.com`);
  });
});
