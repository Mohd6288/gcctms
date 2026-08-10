import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import { grantOhsInduction } from "../helpers/ohs-induction";
import {
  auditLog,
  companies,
  courses,
  documents,
  employees,
  jobRoles,
  payments,
  pricing,
  profiles,
  requestItems,
  trainingRequests,
} from "../../db/schema";
import { encryptNationalId, hashNationalId } from "../../modules/platform/security/national-id";
import type { AuthContext } from "../../modules/platform/auth/shared";
import {
  approveRequest,
  createDraftRequest,
  setEmployeeDecision,
  submitRequest,
  syncRequestItems,
  verifyRequestDocument,
} from "../../modules/requests/service";
import { uploadDocument, verifyEmployeeDocument } from "../../modules/platform/storage/service";
import { rejectPayment, uploadPaymentReceipt, uploadQuotation, verifyPayment } from "../../modules/payments/service";

// Full SADAD payment lifecycle against the real local Supabase Postgres —
// Phase 5 acceptance criteria: end-to-end incl. reject/re-upload, a
// verified payment transitions the covering request to
// ready_for_scheduling, and audits verified_by.
describe("payment lifecycle — real DB", () => {
  const suffix = randomUUID().slice(0, 8);
  const ownerAId = randomUUID();
  const ownerBId = randomUUID();
  const adminId = randomUUID();
  let companyAId: number;
  let companyBId: number;
  let jobRoleId: number;
  let courseId: number;
  let employeeId: number;

  let contractorA: AuthContext;
  let contractorB: AuthContext;
  let adminCtx: AuthContext;

  function pdf(name: string) {
    return new File([new Uint8Array([1, 2, 3])], name, { type: "application/pdf" });
  }

  function xlsx(name: string) {
    return new File([new Uint8Array([1, 2, 3])], name, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }

  async function driveRequestToPaymentPending() {
    const draft = await createDraftRequest(contractorA, { courseId });
    await syncRequestItems(contractorA, { requestId: draft.id, employeeIds: [employeeId] });
    await submitRequest(contractorA, draft.id);
    await uploadDocument(contractorA, { companyId: companyAId, requestId: draft.id, type: "registration_sheet", file: xlsx("reg.xlsx") });
    await uploadDocument(contractorA, { companyId: companyAId, requestId: draft.id, type: "hrbl_request_form", file: xlsx("hrbl.xlsx") });
    await verifyRequestDocument(adminCtx, { requestId: draft.id, type: "registration_sheet" });
    await verifyRequestDocument(adminCtx, { requestId: draft.id, type: "hrbl_request_form" });
    const [item] = await db.select().from(requestItems).where(eq(requestItems.requestId, draft.id));
    await setEmployeeDecision(adminCtx, { requestItemId: item.id, decision: "approved" });
    const approved = await approveRequest(adminCtx, draft.id);
    expect(approved.status).toBe("payment_pending");
    const [payment] = await db.select().from(payments).where(eq(payments.requestId, draft.id));
    return { requestId: draft.id, paymentId: payment.id };
  }

  beforeAll(async () => {
    process.env.NATIONAL_ID_HASH_KEY ??= "test-only-key-do-not-use-in-real-envs";

    await db.execute(
      sql`insert into auth.users (id, email) values (${ownerAId}, ${`pay-a-${suffix}@example.com`}), (${ownerBId}, ${`pay-b-${suffix}@example.com`}), (${adminId}, ${`pay-admin-${suffix}@example.com`})`
    );
    await db.insert(profiles).values({ userId: adminId, role: "platform_admin", fullName: "Payments Test Admin" });

    const [companyA] = await db
      .insert(companies)
      .values({
        name: "Payments Test Contractor A",
        crNumber: `CR-PAY-A-${suffix}`,
        contactName: "A Contact",
        contactEmail: `pay-a-${suffix}@example.com`,
        contactPhone: "0500000001",
        ownerUserId: ownerAId,
      })
      .returning({ id: companies.id });
    companyAId = companyA.id;

    const [companyB] = await db
      .insert(companies)
      .values({
        name: "Payments Test Contractor B",
        crNumber: `CR-PAY-B-${suffix}`,
        contactName: "B Contact",
        contactEmail: `pay-b-${suffix}@example.com`,
        contactPhone: "0500000002",
        ownerUserId: ownerBId,
      })
      .returning({ id: companies.id });
    companyBId = companyB.id;

    const [jobRole] = await db
      .insert(jobRoles)
      .values({ code: `PAY-ROLE-${suffix}`, nameEn: "Test Role", nameAr: "دور تجريبي" })
      .returning({ id: jobRoles.id });
    jobRoleId = jobRole.id;

    const [course] = await db
      .insert(courses)
      .values({ code: `PAY-CSCC-${suffix}`, titleEn: "Payments Test Course", titleAr: "دورة", durationHours: "8" })
      .returning({ id: courses.id });
    courseId = course.id;
    await db.insert(pricing).values({ courseId, price: "400.00", effectiveFrom: "2020-01-01" });

    const [employee] = await db
      .insert(employees)
      .values({
        companyId: companyAId,
        fullNameEn: "Payments Employee",
        fullNameAr: "موظف",
        nationalIdEnc: encryptNationalId("2388800001"),
        nationalIdHash: hashNationalId("2388800001"),
        jobRoleId,
      })
      .returning({ id: employees.id });
    employeeId = employee.id;
    const [iqamaDoc] = await db
      .insert(documents)
      .values({
        companyId: companyAId,
        employeeId,
        type: "national_id",
        bucket: "documents",
        objectKey: randomUUID(),
        originalName: "id.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10,
        checksumSha256: "0".repeat(64),
        uploadedBy: ownerAId,
      })
      .returning({ id: documents.id });
    // Every course is gated on the OHS General Induction.
    await grantOhsInduction(companyAId, employeeId, ownerAId);

    contractorA = { userId: ownerAId, role: "contractor_manager", companyId: companyAId, trainerId: null, region: null, aal: "aal2" };
    contractorB = { userId: ownerBId, role: "contractor_manager", companyId: companyBId, trainerId: null, region: null, aal: "aal2" };
    adminCtx = { userId: adminId, role: "platform_admin", companyId: null, trainerId: null, region: null, aal: "aal2" };

    // approveRequest requires a verified Iqama for every billable employee.
    await verifyEmployeeDocument(adminCtx, iqamaDoc.id);
  });

  afterAll(async () => {
    await db.delete(payments).where(sql`request_id in (select id from ${trainingRequests} where company_id in (${companyAId}, ${companyBId}))`);
    await db.delete(requestItems).where(sql`request_id in (select id from ${trainingRequests} where company_id in (${companyAId}, ${companyBId}))`);
    await db.delete(documents).where(sql`company_id in (${companyAId}, ${companyBId})`);
    await db.delete(trainingRequests).where(sql`company_id in (${companyAId}, ${companyBId})`);
    await db.delete(employees).where(eq(employees.id, employeeId));
    await db.delete(pricing).where(eq(pricing.courseId, courseId));
    await db.delete(courses).where(eq(courses.id, courseId));
    await db.delete(jobRoles).where(eq(jobRoles.id, jobRoleId));
    await db.delete(companies).where(sql`id in (${companyAId}, ${companyBId})`);
    await db.delete(profiles).where(eq(profiles.userId, adminId));
    await db.execute(sql`delete from auth.users where id in (${ownerAId}, ${ownerBId}, ${adminId})`);
  });

  it("cannot verify a payment before any receipt is attached", async () => {
    const { paymentId } = await driveRequestToPaymentPending();
    await expect(verifyPayment(adminCtx, paymentId)).rejects.toThrow("Cannot verify a payment with no receipt attached.");
  });

  it("full cycle: upload -> reject -> re-upload -> verify, request moves to ready_for_scheduling, verified_by audited", async () => {
    const { requestId, paymentId } = await driveRequestToPaymentPending();

    await uploadPaymentReceipt(contractorA, requestId, pdf("receipt-1.pdf"));
    let [payment] = await db.select().from(payments).where(eq(payments.id, paymentId));
    expect(payment.status).toBe("uploaded");
    expect(payment.documentId).not.toBeNull();
    const documentId = payment.documentId!;
    const [firstDoc] = await db.select({ objectKey: documents.objectKey }).from(documents).where(eq(documents.id, documentId));

    await rejectPayment(adminCtx, paymentId, "Amount does not match the invoice.");
    [payment] = await db.select().from(payments).where(eq(payments.id, paymentId));
    expect(payment.status).toBe("rejected");
    expect(payment.rejectionReason).toBe("Amount does not match the invoice.");

    await uploadPaymentReceipt(contractorA, requestId, pdf("receipt-2-corrected.pdf"));
    [payment] = await db.select().from(payments).where(eq(payments.id, paymentId));
    expect(payment.status).toBe("uploaded");
    expect(payment.rejectionReason).toBeNull();
    // Replaced in place — same document row id (so payments.document_id's
    // ON DELETE RESTRICT FK never breaks), but the underlying file changed.
    expect(payment.documentId).toBe(documentId);
    const [secondDoc] = await db.select({ objectKey: documents.objectKey }).from(documents).where(eq(documents.id, documentId));
    expect(secondDoc.objectKey).not.toBe(firstDoc.objectKey);

    await verifyPayment(adminCtx, paymentId);
    [payment] = await db.select().from(payments).where(eq(payments.id, paymentId));
    expect(payment.status).toBe("verified");
    expect(payment.verifiedBy).toBe(adminId);
    expect(payment.verifiedAt).not.toBeNull();

    const [request] = await db.select({ status: trainingRequests.status }).from(trainingRequests).where(eq(trainingRequests.id, requestId));
    expect(request.status).toBe("ready_for_scheduling");

    const auditRows = await db
      .select({ action: auditLog.action, userId: auditLog.userId, toStatus: auditLog.toStatus })
      .from(auditLog)
      .where(sql`entity_type = 'payment' and entity_id = ${paymentId} and action = 'verify'`);
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].userId).toBe(adminId);
    expect(auditRows[0].toStatus).toBe("verified");

    const requestAuditRows = await db
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(sql`entity_type = 'training_request' and entity_id = ${requestId} and action = 'payment_verified'`);
    expect(requestAuditRows).toHaveLength(1);
  });

  it("cannot verify an already-verified payment again", async () => {
    const { paymentId, requestId } = await driveRequestToPaymentPending();
    await uploadPaymentReceipt(contractorA, requestId, pdf("receipt.pdf"));
    await verifyPayment(adminCtx, paymentId);
    await expect(verifyPayment(adminCtx, paymentId)).rejects.toThrow("Illegal payment transition: verified -> verified");
  });

  it("cannot re-upload a receipt once the payment is verified", async () => {
    const { paymentId, requestId } = await driveRequestToPaymentPending();
    await uploadPaymentReceipt(contractorA, requestId, pdf("receipt.pdf"));
    await verifyPayment(adminCtx, paymentId);
    await expect(uploadPaymentReceipt(contractorA, requestId, pdf("too-late.pdf"))).rejects.toThrow(
      "This payment has already been verified."
    );
  });

  it("company B is denied uploading a receipt for company A's request", async () => {
    const { requestId } = await driveRequestToPaymentPending();
    await expect(uploadPaymentReceipt(contractorB, requestId, pdf("intruder.pdf"))).rejects.toThrow("Not authorized");
  });

  // 0034 — the quotation comes out of Dynamics 365 and is the only document
  // that travels admin -> contractor. It is priced on the approved candidate
  // count, so it cannot exist before approval, and a contractor must never be
  // able to produce their own.
  it("an admin attaches the quotation after approval and the contractor sees it", async () => {
    const { requestId } = await driveRequestToPaymentPending();
    const doc = await uploadQuotation(adminCtx, { requestId, file: pdf("quotation.pdf") });

    const [row] = await db
      .select({ type: documents.type, companyId: documents.companyId, verifiedAt: documents.verifiedAt })
      .from(documents)
      .where(eq(documents.id, doc.id));
    expect(row.type).toBe("quotation");
    // Company-scoped to the requesting contractor, which is what makes it
    // readable by them through the ordinary document path.
    expect(row.companyId).toBe(companyAId);
    // Nobody verifies a quotation — GCC Lab issued it.
    expect(row.verifiedAt).toBeNull();

    const audit = await db
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(sql`entity_type = 'training_request' and entity_id = ${requestId} and action = 'upload_quotation'`);
    expect(audit).toHaveLength(1);
  });

  it("refuses a quotation before the request is approved, and from a contractor at any point", async () => {
    const draft = await createDraftRequest(contractorA, { courseId });
    await syncRequestItems(contractorA, { requestId: draft.id, employeeIds: [employeeId] });
    await submitRequest(contractorA, draft.id);
    await expect(uploadQuotation(adminCtx, { requestId: draft.id, file: pdf("early.pdf") })).rejects.toThrow(
      "Approve the request first"
    );

    const { requestId } = await driveRequestToPaymentPending();
    await expect(uploadQuotation(contractorA, { requestId, file: pdf("self-issued.pdf") })).rejects.toThrow("Not authorized");
  });

  it("stops writing the fabricated SADAD reference", async () => {
    const { requestId } = await driveRequestToPaymentPending();
    const [payment] = await db.select({ ref: payments.sadadInvoiceRef }).from(payments).where(eq(payments.requestId, requestId));
    expect(payment.ref).toBeNull();
  });
});
