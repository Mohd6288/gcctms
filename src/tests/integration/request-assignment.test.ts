import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import { companies, profiles, regionalAdminAssignments, trainingRequests } from "../../db/schema";
import { pickAdminForRegion } from "../../modules/requests/assignment";
import { reassignRequest } from "../../modules/requests/service";
import type { AuthContext } from "../../modules/platform/auth/shared";

// Region scoping says who may SEE a request; assignment says who is doing it.
// The rule is "the admin in that region holding the fewest open requests",
// which only means anything if it is deterministic — hence the tie-break on
// who joined the region first.
describe("request assignment — real DB", () => {
  const suffix = randomUUID().slice(0, 8);
  const busyId = randomUUID();
  const freeId = randomUUID();
  const otherRegionId = randomUUID();
  const superAdminId = randomUUID();
  const ownerId = randomUUID();
  const region = "Central";
  let companyId: number;
  const requestIds: number[] = [];

  const superCtx: AuthContext = { userId: superAdminId, role: "super_admin", companyId: null, trainerId: null, region: null, aal: "aal2" };

  async function makeRequest(status: string, assignedTo: string | null) {
    const [row] = await db
      .insert(trainingRequests)
      .values({
        companyId,
        requestedBy: ownerId,
        courseId: (await db.execute<{ id: number }>(sql`select id from courses order by id limit 1`))[0].id,
        status,
        assignedAdminUserId: assignedTo,
      })
      .returning({ id: trainingRequests.id });
    requestIds.push(row.id);
    return row.id;
  }

  beforeAll(async () => {
    for (const id of [busyId, freeId, otherRegionId, superAdminId, ownerId]) {
      await db.execute(sql`insert into auth.users (id) values (${id})`);
    }
    await db.insert(profiles).values([
      { userId: busyId, role: "platform_admin", fullName: `Busy ${suffix}` },
      { userId: freeId, role: "platform_admin", fullName: `Free ${suffix}` },
      { userId: otherRegionId, role: "platform_admin", fullName: `East ${suffix}` },
      { userId: superAdminId, role: "super_admin", fullName: `Super ${suffix}` },
    ]);
    // Busy joins the region first, so a tie would go to them — the test below
    // is only meaningful because the load, not the order, decides it.
    await db.insert(regionalAdminAssignments).values([
      { adminUserId: busyId, region },
      { adminUserId: freeId, region },
      { adminUserId: otherRegionId, region: "East" },
    ]);

    const [company] = await db
      .insert(companies)
      .values({
        name: `Assignment Co ${suffix}`,
        crNumber: `AS-${suffix}`,
        contactName: "Owner",
        contactEmail: `owner-${suffix}@example.com`,
        contactPhone: "0500000000",
        ownerUserId: ownerId,
        region,
      })
      .returning({ id: companies.id });
    companyId = company.id;
  });

  afterAll(async () => {
    if (requestIds.length) await db.delete(trainingRequests).where(inArray(trainingRequests.id, requestIds));
    await db.delete(companies).where(eq(companies.id, companyId));
    await db.delete(regionalAdminAssignments).where(inArray(regionalAdminAssignments.adminUserId, [busyId, freeId, otherRegionId]));
    await db.execute(sql`delete from audit_log where user_id = ${superAdminId}`);
    await db.delete(profiles).where(inArray(profiles.userId, [busyId, freeId, otherRegionId, superAdminId]));
    await db.execute(sql`delete from auth.users where id in (${busyId}, ${freeId}, ${otherRegionId}, ${superAdminId}, ${ownerId})`);
  });

  it("picks the admin holding the fewest open requests, not the first in the region", async () => {
    await makeRequest("submitted", busyId);
    await makeRequest("payment_pending", busyId);
    expect(await pickAdminForRegion(region)).toBe(freeId);

    // Give Free more open work than Busy and the choice flips.
    await makeRequest("submitted", freeId);
    await makeRequest("ready_for_scheduling", freeId);
    await makeRequest("info_requested", freeId);
    expect(await pickAdminForRegion(region)).toBe(busyId);
  });

  it("ignores settled requests when measuring load", async () => {
    // completed/rejected are not work anyone is holding.
    await makeRequest("completed", freeId);
    await makeRequest("rejected", freeId);
    const before = await pickAdminForRegion(region);
    await makeRequest("completed", freeId);
    expect(await pickAdminForRegion(region)).toBe(before);
  });

  it("returns null for a region with no admin rather than failing", async () => {
    // West has nobody assigned — a request there must still be submittable.
    expect(await pickAdminForRegion("West")).toBeNull();
    expect(await pickAdminForRegion(null)).toBeNull();
  });

  it("refuses to assign a request to an admin who covers a different region", async () => {
    const requestId = await makeRequest("submitted", null);
    await expect(reassignRequest(superCtx, { requestId, adminUserId: otherRegionId })).rejects.toThrow(/only covers East/);

    // The same admin, unscoped, is fine — that is what "unassigned means
    // unrestricted" has meant since 0026.
    await db.delete(regionalAdminAssignments).where(eq(regionalAdminAssignments.adminUserId, otherRegionId));
    await reassignRequest(superCtx, { requestId, adminUserId: otherRegionId });
    const [after] = await db.select({ assigned: trainingRequests.assignedAdminUserId }).from(trainingRequests).where(eq(trainingRequests.id, requestId));
    expect(after.assigned).toBe(otherRegionId);
  });

  it("puts a request back in the pool when unassigned", async () => {
    const requestId = await makeRequest("submitted", busyId);
    await reassignRequest(superCtx, { requestId, adminUserId: null });
    const [after] = await db.select({ assigned: trainingRequests.assignedAdminUserId }).from(trainingRequests).where(eq(trainingRequests.id, requestId));
    expect(after.assigned).toBeNull();
  });

  it("refuses to assign a request to somebody who is not an active platform admin", async () => {
    const requestId = await makeRequest("submitted", null);
    await expect(reassignRequest(superCtx, { requestId, adminUserId: superAdminId })).rejects.toThrow(
      "Requests can only be assigned to an active platform admin."
    );
  });
});
