import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import { grantOhsInduction } from "../helpers/ohs-induction";
import { companies, courses, documents, employees, jobRoles, jobs, payments, pricing, profiles, requestItems, trainingRequests } from "../../db/schema";
import { encryptNationalId, hashNationalId } from "../../modules/platform/security/national-id";
import type { AuthContext } from "../../modules/platform/auth/shared";
import {
  approveRequest,
  createDraftRequest,
  requestMoreInfo,
  setEmployeeDecision,
  submitRequest,
  syncRequestItems,
  updateDraftRequest,
  verifyRequestDocument,
} from "../../modules/requests/service";
import { uploadDocument, verifyEmployeeDocument } from "../../modules/platform/storage/service";

// Full training-request lifecycle against the real local Supabase Postgres —
// Phase 4 acceptance criteria: every legal transition works, per-employee
// decisions correctly compute "billable", all-rejected auto-rejects with no
// payment row, info_requested round-trips without a duplicate row, and
// audit rows get written.
describe("training request lifecycle — real DB", () => {
  const suffix = randomUUID().slice(0, 8);
  const ownerId = randomUUID();
  const adminId = randomUUID();
  let companyId: number;
  let jobRoleId: number;
  let courseId: number;
  let employeeWithDocId: number;
  let employeeNoDocId: number;

  let contractorCtx: AuthContext;
  let adminCtx: AuthContext;

  function requestDocFile(name: string) {
    return new File([new Uint8Array([9, 9, 9])], name, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }

  async function attachAndVerifyRequestDocs(requestId: number) {
    await uploadDocument(contractorCtx, { companyId, requestId, type: "registration_sheet", file: requestDocFile("reg.xlsx") });
    await uploadDocument(contractorCtx, { companyId, requestId, type: "hrbl_request_form", file: requestDocFile("hrbl.xlsx") });
    await verifyRequestDocument(adminCtx, { requestId, type: "registration_sheet" });
    await verifyRequestDocument(adminCtx, { requestId, type: "hrbl_request_form" });
  }

  beforeAll(async () => {
    process.env.NATIONAL_ID_HASH_KEY ??= "test-only-key-do-not-use-in-real-envs";

    // notifyPlatformAdmins() looks recipients up via profiles JOIN
    // auth.users.email, so the fixture needs a real (fake-domain) email.
    await db.execute(
      sql`insert into auth.users (id, email) values (${ownerId}, ${`owner-${suffix}@example.com`}), (${adminId}, ${`admin-${suffix}@example.com`})`
    );
    // notifyPlatformAdmins() looks recipients up via a real profiles row —
    // a bare AuthContext object isn't enough for that specific check.
    await db.insert(profiles).values({ userId: adminId, role: "platform_admin", fullName: "Test Platform Admin" });

    const [company] = await db
      .insert(companies)
      .values({
        name: "Requests Lifecycle Test Contractor",
        crNumber: `CR-REQ-${suffix}`,
        contactName: "Contact",
        contactEmail: `req-${suffix}@example.com`,
        contactPhone: "0500000001",
        ownerUserId: ownerId,
      })
      .returning({ id: companies.id });
    companyId = company.id;

    const [jobRole] = await db
      .insert(jobRoles)
      .values({ code: `REQ-ROLE-${suffix}`, nameEn: "Test Role", nameAr: "دور تجريبي" })
      .returning({ id: jobRoles.id });
    jobRoleId = jobRole.id;

    const [course] = await db
      .insert(courses)
      .values({ code: `REQ-CSCC-${suffix}`, titleEn: "Lifecycle Test Course", titleAr: "دورة اختبار", durationHours: "8" })
      .returning({ id: courses.id });
    courseId = course.id;

    await db.insert(pricing).values({ courseId, price: "500.00", effectiveFrom: "2020-01-01" });

    const [empWithDoc] = await db
      .insert(employees)
      .values({
        companyId,
        fullNameEn: "Employee With Doc",
        fullNameAr: "موظف بمستند",
        nationalIdEnc: encryptNationalId("2311100001"),
        nationalIdHash: hashNationalId("2311100001"),
        jobRoleId,
      })
      .returning({ id: employees.id });
    employeeWithDocId = empWithDoc.id;
    const [iqamaDoc] = await db
      .insert(documents)
      .values({
        companyId,
        employeeId: employeeWithDocId,
        type: "national_id",
        bucket: "documents",
        objectKey: randomUUID(),
        originalName: "id.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10,
        checksumSha256: "0".repeat(64),
        uploadedBy: ownerId,
      })
      .returning({ id: documents.id });
    // Every course is gated on the OHS General Induction — without it these
    // lifecycle cases fail at submit for a reason none of them is testing.
    await grantOhsInduction(companyId, employeeWithDocId, ownerId);

    const [empNoDoc] = await db
      .insert(employees)
      .values({
        companyId,
        fullNameEn: "Employee No Doc",
        fullNameAr: "موظف بدون مستند",
        nationalIdEnc: encryptNationalId("2311100002"),
        nationalIdHash: hashNationalId("2311100002"),
        jobRoleId,
      })
      .returning({ id: employees.id });
    employeeNoDocId = empNoDoc.id;

    contractorCtx = { userId: ownerId, role: "contractor_manager", companyId, trainerId: null, region: null, aal: "aal2" };
    adminCtx = { userId: adminId, role: "platform_admin", companyId: null, trainerId: null, region: null, aal: "aal2" };

    // approveRequest requires every billable employee's Iqama to be verified,
    // not merely uploaded — see approval-requires-verified-iqama.test.ts.
    await verifyEmployeeDocument(adminCtx, iqamaDoc.id);
  });

  afterAll(async () => {
    await db.delete(payments).where(
      sql`request_id in (select id from ${trainingRequests} where company_id = ${companyId})`
    );
    await db.delete(requestItems).where(
      sql`request_id in (select id from ${trainingRequests} where company_id = ${companyId})`
    );
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

  it("full happy path: draft -> submitted -> payment_pending, with a real payment row", async () => {
    const draft = await createDraftRequest(contractorCtx, { courseId });
    await syncRequestItems(contractorCtx, { requestId: draft.id, employeeIds: [employeeWithDocId] });

    const submitted = await submitRequest(contractorCtx, draft.id);
    expect(submitted.status).toBe("submitted");

    await attachAndVerifyRequestDocs(draft.id);

    const [item] = await db.select().from(requestItems).where(eq(requestItems.requestId, draft.id));
    await setEmployeeDecision(adminCtx, { requestItemId: item.id, decision: "approved" });

    const approved = await approveRequest(adminCtx, draft.id);
    expect(approved.status).toBe("payment_pending");

    const [payment] = await db.select().from(payments).where(eq(payments.requestId, draft.id));
    expect(payment.qty).toBe(1);
    expect(payment.unitPrice).toBe("500.00");
    expect(payment.totalAmount).toBe("575.00"); // 500 * 1.15 VAT
    // 0034 retired the fabricated SADAD reference — the uploaded quotation
    // carries the real payment instructions now, so nothing writes this.
    expect(payment.sadadInvoiceRef).toBeNull();
    expect(payment.dueDate).not.toBeNull();

    const [request] = await db.select({ totalAmount: trainingRequests.totalAmount }).from(trainingRequests).where(eq(trainingRequests.id, draft.id));
    expect(request.totalAmount).toBe("575.00");
  });

  it("approveRequest honors an admin unit price override instead of resolving catalog pricing", async () => {
    const draft = await createDraftRequest(contractorCtx, { courseId });
    await syncRequestItems(contractorCtx, { requestId: draft.id, employeeIds: [employeeWithDocId] });
    await submitRequest(contractorCtx, draft.id);
    await attachAndVerifyRequestDocs(draft.id);

    const [item] = await db.select().from(requestItems).where(eq(requestItems.requestId, draft.id));
    await setEmployeeDecision(adminCtx, { requestItemId: item.id, decision: "approved" });

    await approveRequest(adminCtx, draft.id, 750);

    const [payment] = await db.select().from(payments).where(eq(payments.requestId, draft.id));
    expect(payment.unitPrice).toBe("750.00");
  });

  it("all employees rejected -> whole request auto-rejects, no payment row generated", async () => {
    const draft = await createDraftRequest(contractorCtx, { courseId });
    await syncRequestItems(contractorCtx, { requestId: draft.id, employeeIds: [employeeWithDocId] });
    await submitRequest(contractorCtx, draft.id);
    await attachAndVerifyRequestDocs(draft.id);

    const [item] = await db.select().from(requestItems).where(eq(requestItems.requestId, draft.id));
    await setEmployeeDecision(adminCtx, { requestItemId: item.id, decision: "rejected", decisionReason: "Not eligible" });

    const result = await approveRequest(adminCtx, draft.id);
    expect(result.status).toBe("rejected");

    const paymentRows = await db.select().from(payments).where(eq(payments.requestId, draft.id));
    expect(paymentRows).toHaveLength(0);
  });

  it("info_requested round-trips back to submitted on the SAME row — no duplicate request created", async () => {
    const draft = await createDraftRequest(contractorCtx, { courseId });
    await syncRequestItems(contractorCtx, { requestId: draft.id, employeeIds: [employeeWithDocId] });
    await submitRequest(contractorCtx, draft.id);

    const [item] = await db.select().from(requestItems).where(eq(requestItems.requestId, draft.id));
    await setEmployeeDecision(adminCtx, { requestItemId: item.id, decision: "rejected", decisionReason: "premature" });

    await requestMoreInfo(adminCtx, { requestId: draft.id, message: "Please clarify the training dates." });
    const [afterInfoRequest] = await db.select({ status: trainingRequests.status, adminNote: trainingRequests.adminNote }).from(trainingRequests).where(eq(trainingRequests.id, draft.id));
    expect(afterInfoRequest.status).toBe("info_requested");
    expect(afterInfoRequest.adminNote).toBe("Please clarify the training dates.");

    await updateDraftRequest(contractorCtx, { requestId: draft.id, courseId, notes: "Updated per admin feedback" });
    const resubmitted = await submitRequest(contractorCtx, draft.id);
    expect(resubmitted.id).toBe(draft.id);
    expect(resubmitted.status).toBe("submitted");

    // Matches the validated prototype's submitRequest(): resubmitting clears
    // the prior review note and every employee decision for a fresh review.
    const [afterResubmit] = await db.select({ adminNote: trainingRequests.adminNote }).from(trainingRequests).where(eq(trainingRequests.id, draft.id));
    expect(afterResubmit.adminNote).toBeNull();
    const [itemAfterResubmit] = await db.select({ decision: requestItems.decision, decisionReason: requestItems.decisionReason }).from(requestItems).where(eq(requestItems.id, item.id));
    expect(itemAfterResubmit.decision).toBe("pending");
    expect(itemAfterResubmit.decisionReason).toBeNull();

    const rows = await db.select({ id: trainingRequests.id }).from(trainingRequests).where(eq(trainingRequests.companyId, companyId));
    const matchingIds = rows.filter((r) => r.id === draft.id);
    expect(matchingIds).toHaveLength(1); // exactly one row for this request id, never duplicated
  });

  it("submitRequest rejects a request with zero employees", async () => {
    const draft = await createDraftRequest(contractorCtx, { courseId });
    await expect(submitRequest(contractorCtx, draft.id)).rejects.toThrow("Add at least one employee before submitting.");
  });

  it("submitRequest rejects when an employee is missing their national ID document", async () => {
    const draft = await createDraftRequest(contractorCtx, { courseId });
    await syncRequestItems(contractorCtx, { requestId: draft.id, employeeIds: [employeeNoDocId] });
    await expect(submitRequest(contractorCtx, draft.id)).rejects.toThrow(
      "All employees must have a national ID document uploaded before submitting."
    );
  });

  it("approveRequest rejects when the request-level documents aren't verified yet", async () => {
    const draft = await createDraftRequest(contractorCtx, { courseId });
    await syncRequestItems(contractorCtx, { requestId: draft.id, employeeIds: [employeeWithDocId] });
    await submitRequest(contractorCtx, draft.id);
    // No attachAndVerifyRequestDocs() call here — deliberately missing.
    await expect(approveRequest(adminCtx, draft.id)).rejects.toThrow(
      "Both the Registration Sheet and HRBL_0004_FO_001 must be verified before approving."
    );
  });

  it("approveRequest rejects a request that isn't in submitted status", async () => {
    const draft = await createDraftRequest(contractorCtx, { courseId });
    await expect(approveRequest(adminCtx, draft.id)).rejects.toThrow("Illegal training_request transition: draft -> payment_pending");
  });

  it("submitRequest queues a notification job instead of sending inline", async () => {
    const before = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.type, "notification.email"));

    const draft = await createDraftRequest(contractorCtx, { courseId });
    await syncRequestItems(contractorCtx, { requestId: draft.id, employeeIds: [employeeWithDocId] });
    await submitRequest(contractorCtx, draft.id);

    const after = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.type, "notification.email"));
    expect(after.length).toBeGreaterThan(before.length);
  });
});
