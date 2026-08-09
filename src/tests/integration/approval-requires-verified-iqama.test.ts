import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import { companies, courses, documents, employees, jobRoles, payments, pricing, profiles, requestItems, trainingRequests } from "../../db/schema";
import { encryptNationalId, hashNationalId } from "../../modules/platform/security/national-id";
import type { AuthContext } from "../../modules/platform/auth/shared";
import { approveRequest, createDraftRequest, setEmployeeDecision, submitRequest, syncRequestItems, verifyRequestDocument } from "../../modules/requests/service";
import { uploadDocument, verifyEmployeeDocument } from "../../modules/platform/storage/service";
import { grantOhsInduction } from "../helpers/ohs-induction";

// An Iqama is the only proof that the person being certified is who the
// contractor says they are, and SEC accepts residency IDs only. Requiring
// one to merely *exist* before submit left the actual check optional: an
// admin could approve, invoice and schedule a candidate whose ID nobody had
// looked at. Approval is the last point where that's still cheap to catch.
describe("approveRequest — every billable employee needs a verified Iqama", () => {
  const suffix = randomUUID().slice(0, 8);
  const ownerId = randomUUID();
  const adminId = randomUUID();
  let companyId: number;
  let jobRoleId: number;
  let courseId: number;
  let verifiedEmployeeId: number;
  let unverifiedEmployeeId: number;
  let contractorCtx: AuthContext;
  let adminCtx: AuthContext;

  function xlsx(name: string) {
    return new File([new Uint8Array([1, 2, 3])], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  async function makeEmployee(name: string, iqama: string) {
    const [employee] = await db
      .insert(employees)
      .values({
        companyId,
        fullNameEn: name,
        fullNameAr: name,
        nationalIdEnc: encryptNationalId(iqama),
        nationalIdHash: hashNationalId(iqama),
        jobRoleId,
      })
      .returning({ id: employees.id });
    const doc = await uploadDocument(contractorCtx, {
      companyId,
      employeeId: employee.id,
      type: "national_id",
      file: new File([new Uint8Array([7, 7, 7])], "iqama.pdf", { type: "application/pdf" }),
    });
    await grantOhsInduction(companyId, employee.id, ownerId);
    return { employeeId: employee.id, documentId: doc.id };
  }

  async function driveToSubmitted(employeeIds: number[]) {
    const draft = await createDraftRequest(contractorCtx, { courseId });
    await syncRequestItems(contractorCtx, { requestId: draft.id, employeeIds });
    await submitRequest(contractorCtx, draft.id);
    await uploadDocument(contractorCtx, { companyId, requestId: draft.id, type: "registration_sheet", file: xlsx("reg.xlsx") });
    await uploadDocument(contractorCtx, { companyId, requestId: draft.id, type: "hrbl_request_form", file: xlsx("hrbl.xlsx") });
    await verifyRequestDocument(adminCtx, { requestId: draft.id, type: "registration_sheet" });
    await verifyRequestDocument(adminCtx, { requestId: draft.id, type: "hrbl_request_form" });
    return draft.id;
  }

  beforeAll(async () => {
    process.env.NATIONAL_ID_HASH_KEY ??= "test-only-key-do-not-use-in-real-envs";
    await db.execute(
      sql`insert into auth.users (id, email) values (${ownerId}, ${`iqama-owner-${suffix}@example.com`}), (${adminId}, ${`iqama-admin-${suffix}@example.com`})`
    );
    await db.insert(profiles).values({ userId: adminId, role: "platform_admin", fullName: "Iqama Gate Admin" });

    const [company] = await db
      .insert(companies)
      .values({
        name: "Iqama Gate Contractor",
        crNumber: `CR-IQG-${suffix}`,
        contactName: "Contact",
        contactEmail: `iqg-${suffix}@example.com`,
        contactPhone: "0500000001",
        ownerUserId: ownerId,
      })
      .returning({ id: companies.id });
    companyId = company.id;

    const [jobRole] = await db.insert(jobRoles).values({ code: `IQG-${suffix}`, nameEn: "Gate Role", nameAr: "دور" }).returning({ id: jobRoles.id });
    jobRoleId = jobRole.id;

    const [course] = await db
      .insert(courses)
      .values({ code: `IQG-C-${suffix}`, titleEn: "Iqama Gate Course", titleAr: "دورة", durationHours: "8" })
      .returning({ id: courses.id });
    courseId = course.id;
    await db.insert(pricing).values({ courseId, price: "500.00", effectiveFrom: "2020-01-01" });

    contractorCtx = { userId: ownerId, role: "contractor_manager", companyId, trainerId: null, region: null, aal: "aal2" };
    adminCtx = { userId: adminId, role: "platform_admin", companyId: null, trainerId: null, region: null, aal: "aal2" };

    const verified = await makeEmployee("Verified Iqama", "2344400011");
    verifiedEmployeeId = verified.employeeId;
    await verifyEmployeeDocument(adminCtx, verified.documentId);

    const unverified = await makeEmployee("Unverified Iqama", "2344400022");
    unverifiedEmployeeId = unverified.employeeId;
  });

  afterAll(async () => {
    await db.delete(payments).where(sql`request_id in (select id from ${trainingRequests} where company_id = ${companyId})`);
    await db.delete(requestItems).where(sql`request_id in (select id from ${trainingRequests} where company_id = ${companyId})`);
    await db.delete(documents).where(eq(documents.companyId, companyId));
    await db.delete(trainingRequests).where(eq(trainingRequests.companyId, companyId));
    await db.delete(employees).where(eq(employees.companyId, companyId));
    await db.delete(pricing).where(eq(pricing.courseId, courseId));
    await db.delete(courses).where(eq(courses.id, courseId));
    await db.delete(jobRoles).where(eq(jobRoles.id, jobRoleId));
    await db.delete(companies).where(eq(companies.id, companyId));
    await db.delete(profiles).where(eq(profiles.userId, adminId));
    await db.execute(sql`delete from auth.users where id in (${ownerId}, ${adminId})`);
  });

  it("blocks approval while a billable employee's Iqama is still unverified", async () => {
    const requestId = await driveToSubmitted([unverifiedEmployeeId]);
    await expect(approveRequest(adminCtx, requestId)).rejects.toThrow(/Iqama/i);

    const [request] = await db.select().from(trainingRequests).where(eq(trainingRequests.id, requestId));
    expect(request.status).toBe("submitted"); // no half-approval, no invoice
    const invoice = await db.select().from(payments).where(eq(payments.requestId, requestId));
    expect(invoice).toHaveLength(0);
  });

  it("approves once that Iqama is verified", async () => {
    const requestId = await driveToSubmitted([verifiedEmployeeId]);
    const result = await approveRequest(adminCtx, requestId);
    expect(result.status).toBe("payment_pending");
  });

  it("ignores a rejected employee's unverified Iqama — they aren't being trained", async () => {
    const requestId = await driveToSubmitted([verifiedEmployeeId, unverifiedEmployeeId]);
    const items = await db.select().from(requestItems).where(eq(requestItems.requestId, requestId));
    const unverifiedItem = items.find((i) => i.employeeId === unverifiedEmployeeId)!;
    await setEmployeeDecision(adminCtx, { requestItemId: unverifiedItem.id, decision: "rejected", decisionReason: "ID not provided" });

    const result = await approveRequest(adminCtx, requestId);
    expect(result.status).toBe("payment_pending");

    const [payment] = await db.select().from(payments).where(eq(payments.requestId, requestId));
    expect(payment.qty).toBe(1); // only the billable, verified employee
  });

  it("blocks a multi-employee request when any one billable Iqama is unverified", async () => {
    const requestId = await driveToSubmitted([verifiedEmployeeId, unverifiedEmployeeId]);
    await expect(approveRequest(adminCtx, requestId)).rejects.toThrow(/Iqama/i);
  });
});
