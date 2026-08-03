import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import { companies, courses, profiles, trainingRequests } from "../../db/schema";
import { createAdminClient } from "../../lib/supabase/admin";
import { registerCompany } from "../../modules/companies/service";
import { withRole } from "../rls/with-role";

// Phase 3 acceptance criteria: "full contractor journey works, company can
// submit a request immediately after registering". Uses the real
// registerCompany() service function (what registerCompanyAction calls),
// then attempts a real training_requests INSERT scoped by the resulting
// company's own claims via RLS — proving there's no hidden pending/approval
// gate blocking a freshly self-registered company, per roles-and-workflows.md's
// deferred-CR-verification note.
describe("company self-registration unlocks request submission immediately", () => {
  const suffix = randomUUID().slice(0, 8);
  let userId: string;
  let companyId: number;
  let courseId: number;
  let requestId: number | undefined;

  afterAll(async () => {
    if (requestId) await db.delete(trainingRequests).where(eq(trainingRequests.id, requestId));
    await db.delete(courses).where(eq(courses.id, courseId));
    await db.delete(profiles).where(eq(profiles.userId, userId));
    await db.delete(companies).where(eq(companies.id, companyId));
    await createAdminClient().auth.admin.deleteUser(userId);
  });

  it("registers a company with status active and no pending gate", async () => {
    const result = await registerCompany({
      name: "Freshly Registered Contractor",
      crNumber: `CR-FRESH-${suffix}`,
      contactName: "New Contact",
      contactEmail: `fresh-${suffix}@example.com`,
      contactPhone: "0500000099",
      password: "Correct-Horse-Battery-Staple-9",
    });
    userId = result.userId;
    companyId = result.companyId;

    const [company] = await db.select({ status: companies.status }).from(companies).where(eq(companies.id, companyId));
    expect(company.status).toBe("active");
  });

  it("the new company's own claims can INSERT a training_requests row via RLS, right away", async () => {
    const [course] = await db
      .insert(courses)
      .values({ code: `FRESH-CSCC-${suffix}`, titleEn: "Fresh Course", titleAr: "دورة", durationHours: "8" })
      .returning({ id: courses.id });
    courseId = course.id;

    const inserted = await withRole(
      { sub: userId, role: "authenticated", user_role: "contractor_manager", company_id: companyId },
      (tx) =>
        tx
          .insert(trainingRequests)
          .values({ companyId, requestedBy: userId, courseId })
          .returning({ id: trainingRequests.id, status: trainingRequests.status })
    );

    expect(inserted).toHaveLength(1);
    expect(inserted[0].status).toBe("draft");

    // withRole always rolls back (it's a probe helper) — insert for real
    // via the trusted path so afterAll's cleanup has something to delete
    // and so this is a genuine, persisted proof, not just a dry run.
    const [persisted] = await db
      .insert(trainingRequests)
      .values({ companyId, requestedBy: userId, courseId })
      .returning({ id: trainingRequests.id });
    requestId = persisted.id;
  });
});
