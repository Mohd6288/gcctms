import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import { cities, companies, courses, trainingRequests } from "../../db/schema";

// 0032 replaced training_requests_preferred_city_check with a foreign key
// onto cities(name). The point was to make adding a city data rather than a
// migration WITHOUT weakening the guarantee — so this asserts the guarantee
// is still real, and that a newly added city works immediately.
describe("preferred_city foreign key", () => {
  const suffix = randomUUID().slice(0, 8);
  const ownerId = randomUUID();
  const newCity = `Testville-${suffix}`;
  let companyId: number;
  let courseId: number;

  beforeAll(async () => {
    await db.execute(sql`insert into auth.users (id) values (${ownerId})`);
    const [company] = await db
      .insert(companies)
      .values({
        name: "City FK Contractor",
        crNumber: `CR-CITYFK-${suffix}`,
        contactName: "C",
        contactEmail: `cityfk-${suffix}@example.com`,
        contactPhone: "0500000001",
        ownerUserId: ownerId,
      })
      .returning({ id: companies.id });
    companyId = company.id;
    const [course] = await db
      .insert(courses)
      .values({ code: `CITYFK-${suffix}`, titleEn: "City FK Course", titleAr: "دورة", durationHours: "8" })
      .returning({ id: courses.id });
    courseId = course.id;
  });

  afterAll(async () => {
    await db.delete(trainingRequests).where(eq(trainingRequests.companyId, companyId));
    await db.delete(companies).where(eq(companies.id, companyId));
    await db.delete(courses).where(eq(courses.id, courseId));
    await db.delete(cities).where(eq(cities.name, newCity));
    await db.execute(sql`delete from auth.users where id = ${ownerId}`);
  });

  it("rejects a city that isn't in the table", async () => {
    await expect(
      db.insert(trainingRequests).values({ companyId, requestedBy: ownerId, courseId, preferredCity: "Atlantis" })
    ).rejects.toThrow();
  });

  it("accepts the four seeded cities", async () => {
    const seeded = await db.select({ name: cities.name }).from(cities);
    expect(seeded.map((c) => c.name).sort()).toEqual(["Abha", "Dammam", "Jeddah", "Riyadh"]);

    const [row] = await db
      .insert(trainingRequests)
      .values({ companyId, requestedBy: ownerId, courseId, preferredCity: "Dammam" })
      .returning({ id: trainingRequests.id });
    expect(row.id).toBeGreaterThan(0);
  });

  it("accepts a city a super_admin adds, with no migration", async () => {
    await db.insert(cities).values({ name: newCity, region: "Central", nameAr: "مدينة تجريبية" });

    const [row] = await db
      .insert(trainingRequests)
      .values({ companyId, requestedBy: ownerId, courseId, preferredCity: newCity })
      .returning({ id: trainingRequests.id });
    expect(row.id).toBeGreaterThan(0);

    // ON DELETE RESTRICT: a city with request history can't be removed,
    // which is why the UI deactivates instead of deleting.
    await expect(db.delete(cities).where(eq(cities.name, newCity))).rejects.toThrow();
    await db.delete(trainingRequests).where(eq(trainingRequests.preferredCity, newCity));
  });
});
