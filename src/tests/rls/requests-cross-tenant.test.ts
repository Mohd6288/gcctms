import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../../db";
import { companies, courses, requestItems, trainingRequests } from "../../db/schema";
import { withRole } from "./with-role";

// Phase 4 acceptance criteria: "RLS keeps requests company-scoped (tests)".
describe("RLS — training_requests/request_items cross-tenant denial", () => {
  const suffix = randomUUID().slice(0, 8);
  const ownerAId = randomUUID();
  const ownerBId = randomUUID();
  let companyAId: number;
  let companyBId: number;
  let courseId: number;
  let requestId: number;

  beforeAll(async () => {
    await db.execute(sql`insert into auth.users (id) values (${ownerAId}), (${ownerBId})`);

    const [companyA] = await db
      .insert(companies)
      .values({
        name: "RLS Requests Test Contractor A",
        crNumber: `CR-RLSREQ-A-${suffix}`,
        contactName: "A Contact",
        contactEmail: `rlsreq-a-${suffix}@example.com`,
        contactPhone: "0500000001",
        ownerUserId: ownerAId,
      })
      .returning({ id: companies.id });
    companyAId = companyA.id;

    const [companyB] = await db
      .insert(companies)
      .values({
        name: "RLS Requests Test Contractor B",
        crNumber: `CR-RLSREQ-B-${suffix}`,
        contactName: "B Contact",
        contactEmail: `rlsreq-b-${suffix}@example.com`,
        contactPhone: "0500000002",
        ownerUserId: ownerBId,
      })
      .returning({ id: companies.id });
    companyBId = companyB.id;

    const [course] = await db
      .insert(courses)
      .values({ code: `RLSREQ-CSCC-${suffix}`, titleEn: "RLS Requests Course", titleAr: "دورة", durationHours: "8" })
      .returning({ id: courses.id });
    courseId = course.id;

    const [request] = await db
      .insert(trainingRequests)
      .values({ companyId: companyAId, requestedBy: ownerAId, courseId })
      .returning({ id: trainingRequests.id });
    requestId = request.id;
  });

  afterAll(async () => {
    await db.delete(requestItems).where(sql`request_id = ${requestId}`);
    await db.delete(trainingRequests).where(sql`id = ${requestId}`);
    await db.delete(courses).where(sql`id = ${courseId}`);
    await db.delete(companies).where(sql`id in (${companyAId}, ${companyBId})`);
    await db.execute(sql`delete from auth.users where id in (${ownerAId}, ${ownerBId})`);
  });

  it("company B cannot see company A's training request via SELECT", async () => {
    const rows = await withRole(
      { sub: ownerBId, role: "authenticated", user_role: "contractor_manager", company_id: companyBId },
      (tx) => tx.select().from(trainingRequests).where(sql`id = ${requestId}`)
    );
    expect(rows).toHaveLength(0);
  });

  it("company A can see its own training request via SELECT", async () => {
    const rows = await withRole(
      { sub: ownerAId, role: "authenticated", user_role: "contractor_manager", company_id: companyAId },
      (tx) => tx.select().from(trainingRequests).where(sql`id = ${requestId}`)
    );
    expect(rows).toHaveLength(1);
  });

  it("company B is denied by the database when INSERTing a request under company A's id", async () => {
    await expect(
      withRole({ sub: ownerBId, role: "authenticated", user_role: "contractor_manager", company_id: companyBId }, (tx) =>
        tx.insert(trainingRequests).values({ companyId: companyAId, requestedBy: ownerBId, courseId })
      )
    ).rejects.toMatchObject({ cause: { code: "42501" } });
  });

  it("company B cannot see request_items belonging to company A's request", async () => {
    const rows = await withRole(
      { sub: ownerBId, role: "authenticated", user_role: "contractor_manager", company_id: companyBId },
      (tx) => tx.select().from(requestItems).where(sql`request_id = ${requestId}`)
    );
    expect(rows).toHaveLength(0);
  });

  it("platform_admin can see any company's training request", async () => {
    const rows = await withRole({ sub: randomUUID(), role: "authenticated", user_role: "platform_admin" }, (tx) =>
      tx.select().from(trainingRequests).where(sql`id = ${requestId}`)
    );
    expect(rows).toHaveLength(1);
  });
});
