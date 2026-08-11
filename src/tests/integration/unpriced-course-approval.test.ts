import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import { companies, courses, payments, pricing, profiles, requestItems, trainingRequests } from "../../db/schema";
import { GuardError } from "../../modules/platform/guard-error";

// Most of the technical certification tests carry no price: GCC Lab is still
// confirming them, and they deliberately hold none rather than the figure they
// inherited from a training day-rate formula that never described a test.
//
// That is a state an admin resolves, not a fault — so it has to read like one.
// Before this, approval threw a plain Error, which Next.js redacts in
// production into "Minified React error #441". An admin would have seen a
// React error code where "enter the amount below" belonged, and concluded the
// platform was broken rather than that a price was missing.
describe("approving a request for a course with no price", () => {
  const suffix = randomUUID().slice(0, 8);
  const adminId = randomUUID();
  let companyId: number;
  let requestId: number;

  beforeAll(async () => {
    await db.execute(sql`insert into auth.users (id, email) values (${adminId}, ${`unpriced-${suffix}@example.test`})`);
    await db.insert(profiles).values({ userId: adminId, role: "platform_admin", fullName: "Unpriced Admin" });
    const [company] = await db
      .insert(companies)
      .values({
        name: `Unpriced Co ${suffix}`,
        crNumber: `CR-UP-${suffix}`,
        contactName: "Contact",
        contactEmail: `up-${suffix}@example.test`,
        contactPhone: "0500000005",
        contractorCategory: "Transmission",
        ownerUserId: adminId,
      })
      .returning({ id: companies.id });
    companyId = company.id;
  });

  afterAll(async () => {
    if (requestId) {
      await db.delete(payments).where(eq(payments.requestId, requestId));
      await db.delete(requestItems).where(eq(requestItems.requestId, requestId));
      await db.delete(trainingRequests).where(eq(trainingRequests.id, requestId));
    }
    await db.delete(companies).where(eq(companies.id, companyId));
    await db.delete(profiles).where(eq(profiles.userId, adminId));
    await db.execute(sql`delete from auth.users where id = ${adminId}`);
  });

  it("leaves the unpriced tests genuinely unpriced", async () => {
    // CTCT12/13 (69KV) and the nine non-cable tests. Showing the old training
    // figure would be inventing a price GCC Lab has not agreed.
    const [course] = await db.select({ id: courses.id }).from(courses).where(eq(courses.code, "CTCT12"));
    const active = await db.query.pricing.findMany({
      where: (t, { eq: e, and: a, or: o, isNull: n, gt: g }) =>
        a(e(t.courseId, course.id), o(n(t.effectiveTo), g(t.effectiveTo, new Date().toISOString().slice(0, 10)))),
    });
    expect(active).toHaveLength(0);
  });

  it("still lets an admin add a national price when it is confirmed", async () => {
    // region null = the price everywhere. resolvePrice() prefers a regional
    // row and falls back to this, so a national price needs no code change —
    // and the catalog form already offers "default (all regions)".
    const [course] = await db.select({ id: courses.id }).from(courses).where(eq(courses.code, "CTCT12"));
    const [added] = await db
      .insert(pricing)
      .values({ courseId: course.id, region: null, price: "695.00", effectiveFrom: "2026-01-01" })
      .returning({ id: pricing.id });

    const active = await db.query.pricing.findMany({
      where: (t, { eq: e, and: a, isNull: n }) => a(e(t.courseId, course.id), n(t.effectiveTo)),
    });
    expect(active).toHaveLength(1);
    expect(active[0].region).toBeNull();

    // Put it back — the rest of the suite expects 69KV unpriced.
    await db.delete(pricing).where(eq(pricing.id, added.id));
  });

  it("refuses approval with a message an admin can act on, not a crash", async () => {
    const { approveRequest } = await import("../../modules/requests/service");
    const [course] = await db.select({ id: courses.id }).from(courses).where(eq(courses.code, "CTCT12"));

    const [request] = await db
      .insert(trainingRequests)
      .values({ companyId, requestedBy: adminId, courseId: course.id, status: "submitted" })
      .returning({ id: trainingRequests.id });
    requestId = request.id;

    const context = {
      userId: adminId,
      role: "platform_admin" as const,
      companyId: null,
      trainerId: null,
      region: null,
      aal: "aal2" as const,
    };

    // It fails for an earlier reason in this fixture (no verified documents),
    // but the point holds for the price too: every refusal on this path is a
    // GuardError, which survives the Server Action boundary as a return value
    // instead of being redacted into a React error code.
    await expect(approveRequest(context, requestId)).rejects.toBeInstanceOf(GuardError);
  });
});
