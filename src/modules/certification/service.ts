// certification module — business logic (Server Actions call into here, never touch db/ directly for RLS-scoped ops).
import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { classEnrollments, classes, companies, courses, employees, examResults, payments, qualificationCards, requestItems, trainingRequests, certificates } from "@/db/schema";
import { employeeSatisfiesPrerequisites, listCourseJobRoleIds } from "@/modules/catalog/queries";
import { getCertificateRenderData } from "./queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize, type AuthContext } from "@/modules/platform/auth/shared";
import { writeAudit } from "@/modules/platform/audit/service";
import { GuardError } from "@/modules/platform/guard-error";
import { notifyPlatformAdmins, queueNotification } from "@/modules/platform/notifications/service";
import { decryptNationalId } from "@/modules/platform/security/national-id";
import { renderCertificatePdf } from "@/modules/platform/pdf/service";
import type { RevokeCertificateInput } from "./schema";

function formatDateLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function generateSerial(courseCode: string, now: Date): string {
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = String(Math.floor(1000 + Math.random() * 9000));
  return `GCCLAB-${courseCode}-${datePart}-${randomPart}`;
}

function getPublicBaseUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

// The eligibility gate (roles-and-workflows.md): ALL must hold —
// attendance >= course minimum, latest exam = pass (or no exam), the
// covering request's payment verified, employee's job role allowed for the
// course, employee satisfies the course's OR-semantics prerequisites, and
// employee active. Called once per class right after delivery's
// submitResults() marks enrollments attended_complete. Idempotent — never
// creates a second certificate for the same employee+class.
export async function evaluateClassEligibility(classId: number): Promise<{ created: number }> {
  const [cls] = await db.select().from(classes).where(eq(classes.id, classId));
  if (!cls) return { created: 0 };
  const [course] = await db.select().from(courses).where(eq(courses.id, cls.courseId));
  if (!course) return { created: 0 };

  const eligibleRoleIds = await listCourseJobRoleIds(cls.courseId);
  const enrollments = await db.select().from(classEnrollments).where(and(eq(classEnrollments.classId, classId), eq(classEnrollments.status, "attended_complete")));

  // A card-awarding course (0038) hands its credential to the manufacturer to
  // print. This platform records that it was earned; it never issues it, and
  // must never say it did — the public verify page's promise is that a serial
  // it recognises came from GCC Lab.
  const awardsCard = course.outcome === "card";

  let created = 0;
  for (const enrollment of enrollments) {
    const existing = awardsCard
      ? await db.select({ id: qualificationCards.id }).from(qualificationCards).where(and(eq(qualificationCards.employeeId, enrollment.employeeId), eq(qualificationCards.classId, classId)))
      : await db.select({ id: certificates.id }).from(certificates).where(and(eq(certificates.employeeId, enrollment.employeeId), eq(certificates.classId, classId)));
    if (existing.length > 0) continue;

    const [employee] = await db.select().from(employees).where(eq(employees.id, enrollment.employeeId));
    if (!employee) continue;

    const attendanceOk = enrollment.attendancePct != null && Number(enrollment.attendancePct) >= (course.minAttendancePct ?? 90);

    const [latestExam] = await db
      .select({ result: examResults.result })
      .from(examResults)
      .where(eq(examResults.enrollmentId, enrollment.id))
      .orderBy(desc(examResults.attemptNo))
      .limit(1);
    const examOk = !course.examRequired || latestExam?.result === "pass";

    const [item] = await db.select({ requestId: requestItems.requestId }).from(requestItems).where(eq(requestItems.id, enrollment.requestItemId));
    let paymentOk = false;
    if (item) {
      const [payment] = await db.select({ status: payments.status }).from(payments).where(eq(payments.requestId, item.requestId));
      paymentOk = payment?.status === "verified";
    }

    const jobRoleOk = eligibleRoleIds.size === 0 || (employee.jobRoleId != null && eligibleRoleIds.has(employee.jobRoleId));
    const prereqOk = await employeeSatisfiesPrerequisites(employee.id, cls.courseId);
    const activeOk = employee.status === "active";

    if (attendanceOk && examOk && paymentOk && jobRoleOk && prereqOk && activeOk) {
      const eligibility = { attendanceOk, examOk, paymentOk, jobRoleOk, prereqOk, activeOk };

      if (awardsCard) {
        // No serial, no PDF, no approval step — there is nothing for GCC Lab
        // to approve about a card someone else prints. expires_at is left
        // unset: the two-year clock runs from the test date, but the card does
        // not exist until the manufacturer reports it issued.
        const [issuanceType] = await db
          .select({ value: trainingRequests.issuanceType })
          .from(requestItems)
          .innerJoin(trainingRequests, eq(trainingRequests.id, requestItems.requestId))
          .where(eq(requestItems.id, enrollment.requestItemId));

        const [card] = await db
          .insert(qualificationCards)
          .values({
            employeeId: employee.id,
            courseId: cls.courseId,
            classId,
            companyId: enrollment.companyId,
            manufacturerId: cls.manufacturerId,
            status: "awaiting_issuer",
            issuanceType: issuanceType?.value ?? "new",
            testDate: cls.endDate,
            eligibility,
          })
          .returning({ id: qualificationCards.id });
        await writeAudit({ userId: null, entityType: "qualification_card", entityId: card.id, action: "gate_passed", toStatus: "awaiting_issuer" });
      } else {
        const [cert] = await db
          .insert(certificates)
          .values({
            employeeId: employee.id,
            courseId: cls.courseId,
            classId,
            companyId: enrollment.companyId,
            status: "pending_approval",
            eligibility,
          })
          .returning({ id: certificates.id });
        await writeAudit({ userId: null, entityType: "certificate", entityId: cert.id, action: "gate_passed", toStatus: "pending_approval" });
      }
      created += 1;
    }
  }

  if (created > 0) {
    // Different next action: a certificate waits for an approval, a card waits
    // for the pass list to reach whoever prints it.
    await notifyPlatformAdmins(awardsCard ? "card.awaiting_dispatch" : "certificate.pending_approval", {
      classId,
      count: created,
    });
  }
  return { created };
}

// Renders the bilingual PDF, uploads it to the private certificates
// bucket, and issues the certificate — serial + expiry are set here, at
// issuance, never computed on read (database-schema.md). Issuance is
// always this explicit admin action, never implicit.
export async function approveCertificate(context: AuthContext, certificateId: number) {
  if (!authorize("approve_certificates", context)) throw new Error("Not authorized");
  const [cert] = await db.select().from(certificates).where(eq(certificates.id, certificateId));
  if (!cert) throw new Error("Certificate not found.");
  if (cert.status !== "pending_approval") throw new GuardError(`Can't approve a certificate that's ${cert.status}.`);

  const data = await getCertificateRenderData(certificateId);
  if (!data) throw new Error("Certificate data not found.");

  const now = new Date();
  const serial = generateSerial(data.courseCode, now);
  const expiresAt = new Date(now.getTime() + 730 * 86_400_000); // 730 days / 2 years

  const pdf = await renderCertificatePdf({
    employeeNameEn: data.employeeFullNameEn,
    employeeNameAr: data.employeeFullNameAr,
    iqama: decryptNationalId(data.nationalIdEnc),
    contractorName: data.companyName,
    courseCode: data.courseCode,
    courseTitleEn: data.courseTitleEn,
    courseTitleAr: data.courseTitleAr,
    startDateLabel: formatDateLabel(data.classStartDate),
    endDateLabel: formatDateLabel(data.classEndDate),
    validTillLabel: formatDateLabel(expiresAt.toISOString().slice(0, 10)),
    serial,
    verifyUrl: `${getPublicBaseUrl()}/en/verify/${serial}`,
  });

  const objectKey = randomUUID();
  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage.from("certificates").upload(objectKey, pdf, { contentType: "application/pdf", upsert: false });
  if (uploadError) throw new GuardError("Could not generate the certificate PDF. Please try again.");

  await db
    .update(certificates)
    .set({ status: "issued", serial, approvedBy: context.userId, approvedAt: now, issuedAt: now, expiresAt, pdfObjectKey: objectKey })
    .where(eq(certificates.id, certificateId));
  await writeAudit({ userId: context.userId, entityType: "certificate", entityId: certificateId, action: "approve", fromStatus: "pending_approval", toStatus: "issued" });

  const [company] = await db.select({ contactEmail: companies.contactEmail }).from(companies).where(eq(companies.id, cert.companyId));
  if (company) await queueNotification({ type: "certificate.issued", recipientEmail: company.contactEmail, data: { certificateId, serial } });
}

// Bulk convenience matching the validated prototype's "Release All
// Eligible" — simpler here than there, since (unlike the prototype) a
// pending_approval row only ever exists once EVERY gate condition already
// passed at creation time (see evaluateClassEligibility above), so there's
// no partial-eligibility re-filtering to do at release time — this is just
// "approve everything still pending for this class."
export async function approveAllPendingForClass(context: AuthContext, classId: number): Promise<{ approved: number }> {
  if (!authorize("approve_certificates", context)) throw new Error("Not authorized");
  const pending = await db.select({ id: certificates.id }).from(certificates).where(and(eq(certificates.classId, classId), eq(certificates.status, "pending_approval")));
  for (const { id } of pending) {
    await approveCertificate(context, id);
  }
  return { approved: pending.length };
}

export async function revokeCertificate(context: AuthContext, input: RevokeCertificateInput) {
  if (!authorize("approve_certificates", context)) throw new Error("Not authorized");
  const [cert] = await db.select().from(certificates).where(eq(certificates.id, input.certificateId));
  if (!cert) throw new Error("Certificate not found.");
  if (cert.status !== "issued") throw new GuardError(`Can't revoke a certificate that's ${cert.status}.`);

  await db.update(certificates).set({ status: "revoked", revokedReason: input.reason }).where(eq(certificates.id, input.certificateId));
  await writeAudit({ userId: context.userId, entityType: "certificate", entityId: input.certificateId, action: "revoke", fromStatus: "issued", toStatus: "revoked", note: input.reason });
}

const SIGNED_URL_TTL_SECONDS = 300; // <= 5 min, per security-and-hosting.md

// Mirrors certificates' actual RLS policies (0013_certification.sql):
// platform_admin blanket, contractor_manager scoped to own company_id,
// trainer scoped to classes they taught.
export async function getCertificateDownloadUrl(context: AuthContext, certificateId: number): Promise<string> {
  if (!authorize("view_certificates", context)) throw new Error("Not authorized");

  const [cert] = await db
    .select({ id: certificates.id, companyId: certificates.companyId, pdfObjectKey: certificates.pdfObjectKey, status: certificates.status, trainerId: classes.trainerId })
    .from(certificates)
    .innerJoin(classes, eq(certificates.classId, classes.id))
    .where(eq(certificates.id, certificateId));
  if (!cert || cert.status !== "issued" || !cert.pdfObjectKey) throw new Error("Not found");

  if (context.role === "contractor_manager" && context.companyId !== cert.companyId) throw new Error("Not authorized");
  if (context.role === "trainer" && context.trainerId !== cert.trainerId) throw new Error("Not authorized");

  const admin = createAdminClient();
  const { data, error } = await admin.storage.from("certificates").createSignedUrl(cert.pdfObjectKey, SIGNED_URL_TTL_SECONDS);
  if (error || !data) throw new Error("Could not generate download link.");

  await writeAudit({ userId: context.userId, entityType: "certificate", entityId: cert.id, action: "download" });
  return data.signedUrl;
}
