import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import { grantOhsInduction } from "../helpers/ohs-induction";
import {
  auditLog,
  certificates,
  classEnrollments,
  classes,
  companies,
  courses,
  documents,
  employees,
  jobRoles,
  payments,
  pricing,
  profiles,
  requestItems,
  trainers,
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
import { uploadPaymentReceipt, uploadQuotation, verifyPayment } from "../../modules/payments/service";
import { assignRequestItemRegion, createClass, enrollRequestItem, startClass } from "../../modules/scheduling/service";
import { getSessionDates, setAttendance, setExamResult, submitResults } from "../../modules/delivery/service";
import { approveCertificate, evaluateClassEligibility } from "../../modules/certification/service";
import { getEntityHistory } from "../../modules/directory/queries";

// The whole thing, once, in order: a contractor's request through to a
// certificate in the employee's hand.
//
// Every phase has its own suite already, and each passes while the seam
// between two of them is broken — that is how the quotation step shipped
// unreachable and how a released certificate stayed in the pending list.
// This test exists to walk the joins.
describe("end to end — company request through to an issued certificate", () => {
  const suffix = randomUUID().slice(0, 8);
  const ownerId = randomUUID();
  const adminId = randomUUID();
  const trainerUserId = randomUUID();
  let companyId: number;
  let jobRoleId: number;
  let courseId: number;
  let trainerId: number;
  let employeeId: number;
  let requestId: number;
  let classId: number;

  let contractor: AuthContext;
  let admin: AuthContext;
  let trainer: AuthContext;

  const pdf = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: "application/pdf" });
  const xlsx = (name: string) =>
    new File([new Uint8Array([1, 2, 3])], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

  beforeAll(async () => {
    process.env.NATIONAL_ID_HASH_KEY ??= "test-only-key-do-not-use-in-real-envs";
    await db.execute(sql`insert into auth.users (id) values (${ownerId}), (${adminId}), (${trainerUserId})`);
    await db.insert(profiles).values({ userId: adminId, role: "platform_admin", fullName: `E2E Admin ${suffix}` });

    const [company] = await db
      .insert(companies)
      .values({
        name: `E2E Contracting ${suffix}`,
        crNumber: `E2E-${suffix}`,
        contactName: "Khalid",
        contactEmail: `e2e-${suffix}@example.com`,
        contactPhone: "0500000000",
        ownerUserId: ownerId,
        region: "Central",
        status: "active",
      })
      .returning({ id: companies.id });
    companyId = company.id;

    const [role] = await db.insert(jobRoles).values({ code: `E2E-${suffix}`, nameEn: "Electrician", nameAr: "كهربائي" }).returning({ id: jobRoles.id });
    jobRoleId = role.id;

    // Examined course, so the exam half of the gate is exercised too.
    const [course] = await db
      .insert(courses)
      .values({
        code: `E2E-${suffix}`,
        titleEn: "End To End Safety",
        titleAr: "دورة شاملة",
        durationHours: "16",
        minAttendancePct: 90,
        examRequired: true,
        passMark: 70,
        validityMonths: 24,
      })
      .returning({ id: courses.id });
    courseId = course.id;
    await db.insert(pricing).values({ courseId, price: "500.00", effectiveFrom: "2020-01-01" });

    const [trainerRow] = await db.insert(trainers).values({ userId: trainerUserId, fullName: `E2E Trainer ${suffix}` }).returning({ id: trainers.id });
    trainerId = trainerRow.id;

    const iqama = `2${suffix.replace(/\D/g, "").padEnd(9, "5").slice(0, 9)}`;
    const [employee] = await db
      .insert(employees)
      .values({
        companyId,
        fullNameEn: "Ahmed Hassan",
        fullNameAr: "أحمد حسن",
        nationalIdEnc: encryptNationalId(iqama),
        nationalIdHash: hashNationalId(iqama),
        jobRoleId,
        status: "active",
      })
      .returning({ id: employees.id });
    employeeId = employee.id;

    contractor = { userId: ownerId, role: "contractor_manager", companyId, trainerId: null, region: null, aal: "aal1" };
    admin = { userId: adminId, role: "platform_admin", companyId: null, trainerId: null, region: null, aal: "aal2" };
    trainer = { userId: trainerUserId, role: "trainer", companyId: null, trainerId, region: null, aal: "aal2" };
  });

  afterAll(async () => {
    await db.delete(certificates).where(eq(certificates.companyId, companyId));
    await db.execute(sql`delete from exam_results where enrollment_id in (select id from class_enrollments where company_id = ${companyId})`);
    await db.execute(sql`delete from attendance where employee_id = ${employeeId}`);
    await db.delete(classEnrollments).where(eq(classEnrollments.companyId, companyId));
    await db.delete(classes).where(eq(classes.courseId, courseId));
    // payments.document_id is ON DELETE RESTRICT, so the receipt's payment
    // row has to go before the documents it points at.
    await db.execute(sql`delete from payments where request_id in (select id from training_requests where company_id = ${companyId})`);
    await db.delete(documents).where(eq(documents.companyId, companyId));
    await db.delete(requestItems).where(sql`request_id in (select id from ${trainingRequests} where company_id = ${companyId})`);
    await db.delete(trainingRequests).where(eq(trainingRequests.companyId, companyId));
    await db.delete(employees).where(eq(employees.companyId, companyId));
    await db.delete(trainers).where(eq(trainers.id, trainerId));
    await db.delete(pricing).where(eq(pricing.courseId, courseId));
    await db.delete(courses).where(eq(courses.id, courseId));
    await db.delete(jobRoles).where(eq(jobRoles.id, jobRoleId));
    await db.delete(companies).where(eq(companies.id, companyId));
    await db.execute(sql`delete from audit_log where user_id in (${ownerId}, ${adminId}, ${trainerUserId})`);
    await db.execute(sql`delete from profiles where user_id = ${adminId}`);
    await db.execute(sql`delete from auth.users where id in (${ownerId}, ${adminId}, ${trainerUserId})`);
  });

  it("1. a contractor builds and submits a request", async () => {
    // Every course sits behind the OHS General Induction, so the candidate
    // holds one before they can be put on anything else.
    await grantOhsInduction(companyId, employeeId, adminId);
    await uploadDocument(contractor, { companyId, employeeId, type: "national_id", file: pdf("iqama.pdf") });

    const draft = await createDraftRequest(contractor, { courseId });
    requestId = draft.id;
    await syncRequestItems(contractor, { requestId, employeeIds: [employeeId] });

    const submitted = await submitRequest(contractor, requestId);
    expect(submitted.status).toBe("submitted");
  });

  it("2. the admin verifies the documents and approves, which prices the request", async () => {
    await uploadDocument(contractor, { companyId, requestId, type: "registration_sheet", file: xlsx("registration.xlsx") });
    await uploadDocument(contractor, { companyId, requestId, type: "hrbl_request_form", file: xlsx("hrbl.xlsx") });
    await verifyRequestDocument(admin, { requestId, type: "registration_sheet" });
    await verifyRequestDocument(admin, { requestId, type: "hrbl_request_form" });

    // Approval is blocked until the candidate's Iqama is verified.
    const [iqamaDoc] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.employeeId, employeeId), eq(documents.type, "national_id")));
    await verifyEmployeeDocument(admin, iqamaDoc.id);

    const [item] = await db.select().from(requestItems).where(eq(requestItems.requestId, requestId));
    await setEmployeeDecision(admin, { requestItemId: item.id, decision: "approved" });

    const approved = await approveRequest(admin, requestId);
    expect(approved.status).toBe("payment_pending");

    const [payment] = await db.select().from(payments).where(eq(payments.requestId, requestId));
    expect(payment.qty).toBe(1);
    expect(payment.totalAmount).toBe("575.00"); // 500 + 15% VAT
    // Retired in 0034 — the quotation carries the real instructions now.
    expect(payment.sadadInvoiceRef).toBeNull();
  });

  it("3. the admin sends the quotation, and only then can the contractor pay", async () => {
    const quotation = await uploadQuotation(admin, { requestId, file: pdf("quotation.pdf") });
    const [doc] = await db.select({ type: documents.type }).from(documents).where(eq(documents.id, quotation.id));
    expect(doc.type).toBe("quotation");

    await uploadPaymentReceipt(contractor, requestId, pdf("receipt.pdf"));
    const [payment] = await db.select().from(payments).where(eq(payments.requestId, requestId));
    expect(payment.documentId).not.toBeNull();

    await verifyPayment(admin, payment.id);
    const [request] = await db.select({ status: trainingRequests.status }).from(trainingRequests).where(eq(trainingRequests.id, requestId));
    expect(request.status).toBe("ready_for_scheduling");
  });

  it("4. the admin schedules a class with a location and enrols the candidate", async () => {
    const [item] = await db.select().from(requestItems).where(eq(requestItems.requestId, requestId));
    await assignRequestItemRegion(admin, { requestItemId: item.id, region: "Central" });

    const cls0 = await createClass(admin, {
      courseId,
      trainerId,
      region: "Central",
      type: "public",
      startDate: "2034-03-01",
      endDate: "2034-03-02",
      capacity: 10,
      // 0037: coordinated per class, and the thing a candidate needs on the
      // morning.
      locationUrl: "https://maps.example.com/gcclab-riyadh",
      locationNote: "Gate 3, second floor",
    });
    classId = cls0.id;

    const [cls] = await db.select().from(classes).where(eq(classes.id, classId));
    expect(cls.locationUrl).toBe("https://maps.example.com/gcclab-riyadh");
    expect(cls.locationNote).toBe("Gate 3, second floor");

    await enrollRequestItem(admin, { classId, requestItemId: item.id });
    const [enrollment] = await db.select().from(classEnrollments).where(eq(classEnrollments.classId, classId));
    expect(enrollment.status).toBe("enrolled");

    const [request] = await db.select({ status: trainingRequests.status }).from(trainingRequests).where(eq(trainingRequests.id, requestId));
    expect(request.status).toBe("scheduled");
  });

  it("5. the trainer records attendance and a passing score", async () => {
    await startClass(admin, classId);

    const sessions = getSessionDates("2034-03-01", "2034-03-02");
    expect(sessions).toEqual(["2034-03-01", "2034-03-02"]);
    for (const day of sessions) {
      await setAttendance(trainer, { classId, employeeId, sessionDate: day, present: true });
    }

    // The score decides the outcome — the trainer no longer asserts it (0035).
    await setExamResult(trainer, { classId, employeeId, score: 88 });

    await submitResults(trainer, classId);
    const [enrollment] = await db.select().from(classEnrollments).where(eq(classEnrollments.classId, classId));
    expect(Number(enrollment.attendancePct)).toBe(100);
  });

  it("6. the certificate drafts itself, then the admin releases it with a real PDF", async () => {
    // submitResults runs the eligibility gate itself, so the draft already
    // exists by the time the trainer is done — issuance is never implicit,
    // but drafting is. Re-running it must create nothing.
    const evaluated = await evaluateClassEligibility(classId);
    expect(evaluated.created).toBe(0);

    const [pending] = await db
      .select()
      .from(certificates)
      .where(and(eq(certificates.classId, classId), eq(certificates.status, "pending_approval")));
    expect(pending).toBeTruthy();

    await approveCertificate(admin, pending.id);

    const [issued] = await db.select().from(certificates).where(eq(certificates.id, pending.id));
    expect(issued.status).toBe("issued");
    expect(issued.serial).toMatch(new RegExp(`^GCCLAB-E2E-${suffix}-\\d{8}-\\d{4}$`));
    expect(issued.pdfObjectKey).toBeTruthy();

    // A real round trip to storage — a row claiming a PDF is not a PDF.
    const { createAdminClient } = await import("../../lib/supabase/admin");
    const { data, error } = await createAdminClient().storage.from("certificates").download(issued.pdfObjectKey!);
    expect(error).toBeNull();
    expect((await data!.arrayBuffer()).byteLength).toBeGreaterThan(1000);
  });

  it("7. the whole journey is on the request's own history", async () => {
    // The trail an auditor opens. If a step above stopped writing its audit
    // row, this is where it shows.
    const history = await getEntityHistory("training_request", requestId);
    const actions = history.map((h) => h.action);
    expect(actions).toContain("submit");
    expect(actions).toContain("approve");
    expect(actions).toContain("upload_quotation");
    expect(actions).toContain("payment_verified");

    const rows = await db.select({ id: auditLog.id }).from(auditLog).where(eq(auditLog.userId, adminId));
    expect(rows.length).toBeGreaterThan(3);
  });
});
