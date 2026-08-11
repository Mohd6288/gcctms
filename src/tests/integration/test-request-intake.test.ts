import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import { companies, courses, profiles, requestItems, trainingRequests } from "../../db/schema";
import { CreateDraftRequestInput, EXTERNAL_INSTITUTE } from "../../modules/requests/schema";
import { createDraftRequest, updateDraftRequest } from "../../modules/requests/service";
import type { AuthContext } from "../../modules/platform/auth/shared";

// The two fields نموذج طلب اختبار has that the platform did not: نوع الطلب
// (new issue / renewal) and معهد خارجي, a venue that is none of GCC Lab's four
// institutes.
//
// The venue is the awkward one. preferred_city is a foreign key onto
// cities.name, so an external institute cannot be stored there, and adding
// every contractor's own venue to the cities table would corrupt the list GCC
// Lab schedules against. So the form sends a sentinel and the name lives in
// its own column — which only works if BOTH the create and update paths
// translate it.
describe("test request intake", () => {
  const suffix = randomUUID().slice(0, 8);
  const ownerId = randomUUID();
  let companyId: number;
  let courseId: number;
  let context: AuthContext;
  const created: number[] = [];

  beforeAll(async () => {
    await db.execute(sql`insert into auth.users (id, email) values (${ownerId}, ${`intake-${suffix}@example.test`})`);
    const [company] = await db
      .insert(companies)
      .values({
        name: `Intake Co ${suffix}`,
        crNumber: `CR-IN-${suffix}`,
        contactName: "Contact",
        contactEmail: `in-${suffix}@example.test`,
        contactPhone: "0500000006",
        contractorCategory: "Distribution",
        ownerUserId: ownerId,
      })
      .returning({ id: companies.id });
    companyId = company.id;
    // After the company: a contractor_manager profile must carry its
    // company_id (profiles_company_id_only_for_contractor).
    await db
      .insert(profiles)
      .values({ userId: ownerId, role: "contractor_manager", companyId, fullName: "Intake Contractor" });

    const [course] = await db.select({ id: courses.id }).from(courses).where(eq(courses.code, "CTCT10"));
    courseId = course.id;
    context = { userId: ownerId, role: "contractor_manager", companyId, trainerId: null, region: null, aal: "aal1" };
  });

  afterAll(async () => {
    for (const id of created) {
      await db.delete(requestItems).where(eq(requestItems.requestId, id));
      await db.delete(trainingRequests).where(eq(trainingRequests.id, id));
    }
    // Profile before company — it holds the foreign key.
    await db.delete(profiles).where(eq(profiles.userId, ownerId));
    await db.delete(companies).where(eq(companies.id, companyId));
    await db.execute(sql`delete from auth.users where id = ${ownerId}`);
  });

  it("records a renewal as distinct from a first issue", async () => {
    const draft = await createDraftRequest(context, { courseId, issuanceType: "renewal", preferredCity: "Riyadh" });
    created.push(draft.id);
    const [row] = await db.select().from(trainingRequests).where(eq(trainingRequests.id, draft.id));
    expect(row.issuanceType).toBe("renewal");
    expect(row.preferredCity).toBe("Riyadh");
    expect(row.externalInstituteName).toBeNull();
  });

  it("stores an external institute by name, and never in the city column", async () => {
    const draft = await createDraftRequest(context, {
      courseId,
      issuanceType: "new",
      preferredCity: EXTERNAL_INSTITUTE,
      externalInstituteName: "Cable workshop – GCCLAB",
    });
    created.push(draft.id);

    const [row] = await db.select().from(trainingRequests).where(eq(trainingRequests.id, draft.id));
    // The sentinel is a form device. Reaching the column would break the
    // foreign key onto cities.name — loudly, but only at the database.
    expect(row.preferredCity).toBeNull();
    expect(row.externalInstituteName).toBe("Cable workshop – GCCLAB");
  });

  it("translates the sentinel on update too, not only on create", async () => {
    const draft = await createDraftRequest(context, { courseId, preferredCity: "Jeddah" });
    created.push(draft.id);

    await updateDraftRequest(context, {
      requestId: draft.id,
      courseId,
      preferredCity: EXTERNAL_INSTITUTE,
      externalInstituteName: "Contractor's own yard",
    });

    const [row] = await db.select().from(trainingRequests).where(eq(trainingRequests.id, draft.id));
    expect(row.preferredCity).toBeNull();
    expect(row.externalInstituteName).toBe("Contractor's own yard");
  });

  it("clears the external name when a GCC Lab institute is chosen instead", async () => {
    const draft = await createDraftRequest(context, {
      courseId,
      preferredCity: EXTERNAL_INSTITUTE,
      externalInstituteName: "Somewhere else",
    });
    created.push(draft.id);

    await updateDraftRequest(context, { requestId: draft.id, courseId, preferredCity: "Dammam" });

    const [row] = await db.select().from(trainingRequests).where(eq(trainingRequests.id, draft.id));
    expect(row.preferredCity).toBe("Dammam");
    // Left behind, it would print on the generated form beside a GCC Lab
    // venue and contradict it.
    expect(row.externalInstituteName).toBeNull();
  });

  it("refuses 'other institute' with no name", async () => {
    // Caught in validation, where the contractor can still fix it — rather
    // than reaching an admin as a request with a blank venue and costing a
    // phone call.
    const parsed = CreateDraftRequestInput.safeParse({ courseId, preferredCity: EXTERNAL_INSTITUTE });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].path).toEqual(["externalInstituteName"]);
    }
  });
});
