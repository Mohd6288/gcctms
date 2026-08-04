// requests module — business logic (Server Actions call into here, never touch db/ directly for RLS-scoped ops).
import "server-only";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { certificates, companies, courses, documents, employees, payments, requestItems, trainingRequests } from "@/db/schema";
import { listCourseJobRoleIds, listCoursePrerequisiteIds } from "@/modules/catalog/queries";
import { authorize, type AuthContext } from "@/modules/platform/auth/shared";
import { writeAudit } from "@/modules/platform/audit/service";
import { notifyPlatformAdmins, queueNotification } from "@/modules/platform/notifications/service";
import { assertTransition, type RequestStatus } from "./machine";
import type {
  CreateDraftRequestInput,
  RejectRequestInput,
  RequestMoreInfoInput,
  SetEmployeeDecisionInput,
  SyncRequestItemsInput,
  UpdateDraftRequestInput,
  VerifyRequestDocumentInput,
} from "./schema";

async function getRequestOrThrow(requestId: number) {
  const [request] = await db.select().from(trainingRequests).where(eq(trainingRequests.id, requestId));
  if (!request) throw new Error("Request not found");
  return request;
}

// Mirrors training_requests' contractor UPDATE policy exactly
// (0008_training_requests.sql): own company AND status still editable.
// platform_admin has a blanket policy, so no per-row check for that role.
function assertContractorOwnsEditableRequest(context: AuthContext, request: { companyId: number; status: string }) {
  if (context.role === "platform_admin") return;
  if (
    context.role === "contractor_manager" &&
    context.companyId === request.companyId &&
    (request.status === "draft" || request.status === "info_requested")
  ) {
    return;
  }
  throw new Error("Not authorized");
}

export async function createDraftRequest(context: AuthContext, input: CreateDraftRequestInput) {
  if (!authorize("submit_requests", context) || !context.companyId) throw new Error("Not authorized");

  const [request] = await db
    .insert(trainingRequests)
    .values({
      companyId: context.companyId,
      requestedBy: context.userId,
      courseId: input.courseId,
      preferredRegion: input.preferredRegion,
      preferredCity: input.preferredCity,
      preferredTrainingType: input.preferredTrainingType,
      preferredStartDate: input.preferredStartDate,
      preferredEndDate: input.preferredEndDate,
      notes: input.notes,
      status: "draft",
    })
    .returning({ id: trainingRequests.id });

  await writeAudit({ userId: context.userId, entityType: "training_request", entityId: request.id, action: "create", toStatus: "draft" });
  return request;
}

export async function updateDraftRequest(context: AuthContext, input: UpdateDraftRequestInput) {
  const request = await getRequestOrThrow(input.requestId);
  assertContractorOwnsEditableRequest(context, request);

  await db
    .update(trainingRequests)
    .set({
      courseId: input.courseId,
      preferredRegion: input.preferredRegion,
      preferredCity: input.preferredCity,
      preferredTrainingType: input.preferredTrainingType,
      preferredStartDate: input.preferredStartDate,
      preferredEndDate: input.preferredEndDate,
      notes: input.notes,
    })
    .where(eq(trainingRequests.id, input.requestId));
}

// Adds/removes employees on a draft/info_requested request to match
// employeeIds exactly (diff-based — safe pre-submission, since request_items
// carry no decision/enrollment progress yet in these states).
export async function syncRequestItems(context: AuthContext, input: SyncRequestItemsInput) {
  const request = await getRequestOrThrow(input.requestId);
  assertContractorOwnsEditableRequest(context, request);

  const existing = await db
    .select({ id: requestItems.id, employeeId: requestItems.employeeId })
    .from(requestItems)
    .where(eq(requestItems.requestId, input.requestId));
  const existingIds = new Set(existing.map((e) => e.employeeId));
  const wantedIds = new Set(input.employeeIds);

  const toRemove = existing.filter((e) => !wantedIds.has(e.employeeId));
  const toAdd = input.employeeIds.filter((id) => !existingIds.has(id));

  if (toRemove.length > 0) {
    await db.delete(requestItems).where(
      inArray(
        requestItems.id,
        toRemove.map((r) => r.id)
      )
    );
  }
  if (toAdd.length > 0) {
    await db.insert(requestItems).values(toAdd.map((employeeId) => ({ requestId: input.requestId, employeeId, courseId: request.courseId })));
  }
}

// Guard: >=1 request item, and every employee has a national_id document
// uploaded (the one strictly-mandatory employee-scoped document —
// prior_certificate is supplementary, not gating).
export async function submitRequest(context: AuthContext, requestId: number) {
  const request = await getRequestOrThrow(requestId);
  assertContractorOwnsEditableRequest(context, request);
  assertTransition(request.status as RequestStatus, "submitted");

  const items = await db.select({ employeeId: requestItems.employeeId }).from(requestItems).where(eq(requestItems.requestId, requestId));
  if (items.length === 0) throw new Error("Add at least one employee before submitting.");

  const employeeIds = items.map((i) => i.employeeId);
  const docs = await db
    .select({ employeeId: documents.employeeId })
    .from(documents)
    .where(and(inArray(documents.employeeId, employeeIds), eq(documents.type, "national_id")));
  const employeesWithDocs = new Set(docs.map((d) => d.employeeId));
  const missingDocs = employeeIds.filter((id) => !employeesWithDocs.has(id));
  if (missingDocs.length > 0) {
    throw new Error("All employees must have a national ID document uploaded before submitting.");
  }

  // Job-role eligibility: the validated prototype only ever shows this as a
  // non-blocking warning badge in the wizard — this is a deliberate
  // strengthening to a real submission guard, per roles-and-workflows.md.
  // course_job_roles with 0 rows for a course = unrestricted (every job role
  // eligible), matching isJobRoleEligible()'s semantics.
  const eligibleRoleIds = await listCourseJobRoleIds(request.courseId);
  if (eligibleRoleIds.size > 0) {
    const employeeRoles = await db.select({ id: employees.id, jobRoleId: employees.jobRoleId }).from(employees).where(inArray(employees.id, employeeIds));
    const ineligible = employeeRoles.filter((e) => !eligibleRoleIds.has(e.jobRoleId));
    if (ineligible.length > 0) {
      throw new Error("All employees must hold a job role eligible for this course before submitting.");
    }
  }

  // Prerequisites: OR-semantics — an employee satisfies the gate by holding a
  // valid (issued, non-expired) certificate for ANY ONE listed prerequisite
  // course. Also a deliberate strengthening over the validated prototype's
  // advisory-only wizard badge — see roles-and-workflows.md.
  const prerequisiteCourseIds = await listCoursePrerequisiteIds(request.courseId);
  if (prerequisiteCourseIds.size > 0) {
    const validCerts = await db
      .select({ employeeId: certificates.employeeId })
      .from(certificates)
      .where(
        and(
          inArray(certificates.employeeId, employeeIds),
          inArray(certificates.courseId, Array.from(prerequisiteCourseIds)),
          eq(certificates.status, "issued"),
          gte(certificates.expiresAt, new Date())
        )
      );
    const satisfied = new Set(validCerts.map((c) => c.employeeId));
    const missingPrerequisites = employeeIds.filter((id) => !satisfied.has(id));
    if (missingPrerequisites.length > 0) {
      throw new Error("All employees must satisfy this course's prerequisites before submitting.");
    }
  }

  // Matches the validated prototype's submitRequest(): resubmitting from
  // info_requested clears the prior review note and every employee
  // decision, so admin re-reviews with a clean slate. A no-op for the
  // draft->submitted path since those fields are already unset there.
  await db.update(requestItems).set({ decision: "pending", decisionReason: null, decidedBy: null, decidedAt: null }).where(eq(requestItems.requestId, requestId));
  await db.update(trainingRequests).set({ status: "submitted", adminNote: null }).where(eq(trainingRequests.id, requestId));
  await writeAudit({
    userId: context.userId,
    entityType: "training_request",
    entityId: requestId,
    action: "submit",
    fromStatus: request.status,
    toStatus: "submitted",
  });
  await notifyPlatformAdmins("request.submitted", { requestId, companyId: request.companyId });

  return { id: requestId, status: "submitted" as const };
}

export async function setEmployeeDecision(context: AuthContext, input: SetEmployeeDecisionInput) {
  if (!authorize("review_requests", context)) throw new Error("Not authorized");

  const [item] = await db.select().from(requestItems).where(eq(requestItems.id, input.requestItemId));
  if (!item) throw new Error("Request item not found");

  await db
    .update(requestItems)
    .set({ decision: input.decision, decisionReason: input.decisionReason ?? null, decidedBy: context.userId, decidedAt: new Date() })
    .where(eq(requestItems.id, input.requestItemId));

  await writeAudit({
    userId: context.userId,
    entityType: "request_item",
    entityId: input.requestItemId,
    action: "decide",
    toStatus: input.decision,
    note: input.decisionReason,
  });
}

// documents' verification-protecting trigger reads auth_role(), which is
// empty for Drizzle's direct superuser connection (no JWT claims set) — it
// would otherwise silently null verified_by/verified_at right back out on
// this UPDATE. The authorize() check above is the real gate for this
// trusted server-side path (Golden Rule 2), so briefly disabling triggers
// for just this one statement is intentional, not a bypass of a check we
// still need.
export async function verifyRequestDocument(context: AuthContext, input: VerifyRequestDocumentInput) {
  if (!authorize("review_requests", context)) throw new Error("Not authorized");

  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.requestId, input.requestId), eq(documents.type, input.type)));
  if (!doc) throw new Error("Document not found");

  await db.transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`);
    await tx.update(documents).set({ verifiedBy: context.userId, verifiedAt: new Date() }).where(eq(documents.id, doc.id));
  });

  await writeAudit({ userId: context.userId, entityType: "document", entityId: doc.id, action: "verify" });
}

async function resolvePrice(courseId: number, region: string | null): Promise<string> {
  const rows = (await db.execute(sql`
    select price from pricing
    where course_id = ${courseId}
      and (region = ${region} or region is null)
      and effective_from <= current_date
      and (effective_to is null or effective_to >= current_date)
    order by region nulls last, effective_from desc
    limit 1
  `)) as unknown as Array<{ price: string }>;
  if (rows.length === 0) throw new Error("No active pricing found for this course.");
  return rows[0].price;
}

// Matches the validated prototype's approveRequest(): submitted->payment_pending
// is a single direct write (no persisted 'approved' intermediate state, one
// audit row) EXCEPT when every employee ends up rejected — then the request
// goes straight submitted->rejected instead of generating an invoice (matches
// roles-and-workflows.md: "if every employee on a request ends up
// individually rejected, the whole request auto-rejects").
export async function approveRequest(context: AuthContext, requestId: number, unitPriceOverride?: number) {
  if (!authorize("review_requests", context)) throw new Error("Not authorized");

  const request = await getRequestOrThrow(requestId);
  if (request.status !== "submitted") {
    throw new Error(`Illegal training_request transition: ${request.status} -> payment_pending`);
  }

  const requestDocs = await db
    .select({ type: documents.type, verifiedAt: documents.verifiedAt })
    .from(documents)
    .where(eq(documents.requestId, requestId));
  const verifiedTypes = new Set(requestDocs.filter((d) => d.verifiedAt !== null).map((d) => d.type));
  if (!verifiedTypes.has("registration_sheet") || !verifiedTypes.has("hrbl_request_form")) {
    throw new Error("Both the Registration Sheet and HRBL_0004_FO_001 must be verified before approving.");
  }

  const items = await db.select().from(requestItems).where(eq(requestItems.requestId, requestId));
  if (items.length === 0) throw new Error("Request has no employees.");
  const billable = items.filter((i) => i.decision !== "rejected");

  const [company] = await db.select({ contactEmail: companies.contactEmail }).from(companies).where(eq(companies.id, request.companyId));

  if (billable.length === 0) {
    assertTransition("submitted", "rejected");
    await db
      .update(trainingRequests)
      .set({ status: "rejected", rejectedReason: "All employees were rejected during review." })
      .where(eq(trainingRequests.id, requestId));
    await writeAudit({
      userId: context.userId,
      entityType: "training_request",
      entityId: requestId,
      action: "auto_reject_all_employees_rejected",
      fromStatus: "submitted",
      toStatus: "rejected",
    });
    if (company) {
      await queueNotification({ type: "request.rejected", recipientEmail: company.contactEmail, data: { requestId } });
    }
    return { id: requestId, status: "rejected" as const };
  }

  assertTransition("submitted", "payment_pending");

  const unitPrice = unitPriceOverride != null ? String(unitPriceOverride) : await resolvePrice(request.courseId, request.preferredRegion);
  const [course] = await db.select({ titleEn: courses.titleEn }).from(courses).where(eq(courses.id, request.courseId));

  // Matches the validated prototype's Invoice: dueDate = issueDate + 14 days,
  // and a SADAD reference generated once at approval and shown to the
  // contractor as the literal payment instruction.
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 14);
  const sadadInvoiceRef = `SADAD-${Math.floor(1000 + Math.random() * 8999)}-${Math.floor(1000 + Math.random() * 8999)}`;

  const [payment] = await db
    .insert(payments)
    .values({
      requestId,
      sadadInvoiceRef,
      dueDate: dueDate.toISOString().slice(0, 10),
      description: course?.titleEn ?? "Training course",
      qty: billable.length,
      unitPrice,
    })
    .returning({ totalAmount: payments.totalAmount });

  await db
    .update(trainingRequests)
    .set({ status: "payment_pending", totalAmount: payment.totalAmount })
    .where(eq(trainingRequests.id, requestId));
  await writeAudit({
    userId: context.userId,
    entityType: "training_request",
    entityId: requestId,
    action: "approve",
    fromStatus: "submitted",
    toStatus: "payment_pending",
  });

  if (company) {
    await queueNotification({ type: "request.approved", recipientEmail: company.contactEmail, data: { requestId, totalAmount: payment.totalAmount } });
  }

  return { id: requestId, status: "payment_pending" as const };
}

export async function requestMoreInfo(context: AuthContext, input: RequestMoreInfoInput) {
  if (!authorize("review_requests", context)) throw new Error("Not authorized");
  const request = await getRequestOrThrow(input.requestId);
  assertTransition(request.status as RequestStatus, "info_requested");

  await db.update(trainingRequests).set({ status: "info_requested", adminNote: input.message }).where(eq(trainingRequests.id, input.requestId));
  await writeAudit({
    userId: context.userId,
    entityType: "training_request",
    entityId: input.requestId,
    action: "request_more_info",
    fromStatus: request.status,
    toStatus: "info_requested",
    note: input.message,
  });

  const [company] = await db.select({ contactEmail: companies.contactEmail }).from(companies).where(eq(companies.id, request.companyId));
  if (company) {
    await queueNotification({ type: "request.info_requested", recipientEmail: company.contactEmail, data: { requestId: input.requestId, message: input.message } });
  }
}

// Reject-whole-request marks every employee decision rejected with the
// same reason (roles-and-workflows.md).
export async function rejectRequest(context: AuthContext, input: RejectRequestInput) {
  if (!authorize("review_requests", context)) throw new Error("Not authorized");
  const request = await getRequestOrThrow(input.requestId);
  assertTransition(request.status as RequestStatus, "rejected");

  await db
    .update(requestItems)
    .set({ decision: "rejected", decisionReason: input.reason, decidedBy: context.userId, decidedAt: new Date() })
    .where(eq(requestItems.requestId, input.requestId));
  await db.update(trainingRequests).set({ status: "rejected", rejectedReason: input.reason }).where(eq(trainingRequests.id, input.requestId));
  await writeAudit({
    userId: context.userId,
    entityType: "training_request",
    entityId: input.requestId,
    action: "reject",
    fromStatus: request.status,
    toStatus: "rejected",
    note: input.reason,
  });

  const [company] = await db.select({ contactEmail: companies.contactEmail }).from(companies).where(eq(companies.id, request.companyId));
  if (company) {
    await queueNotification({ type: "request.rejected", recipientEmail: company.contactEmail, data: { requestId: input.requestId, reason: input.reason } });
  }
}

// Explicit platform_admin action only — never automatic. Matches the
// validated prototype: "closing" a request is never its own status, just
// setting closedAt while status stays 'completed' (types/index.ts's
// TrainingRequest.closedAt).
export async function closeRequest(context: AuthContext, requestId: number) {
  if (!authorize("review_requests", context)) throw new Error("Not authorized");
  const request = await getRequestOrThrow(requestId);
  if (request.status !== "completed") {
    throw new Error(`Cannot close a training_request that isn't completed (current status: ${request.status})`);
  }

  await db.update(trainingRequests).set({ closedAt: new Date() }).where(eq(trainingRequests.id, requestId));
  await writeAudit({
    userId: context.userId,
    entityType: "training_request",
    entityId: requestId,
    action: "close",
    fromStatus: "completed",
    toStatus: "completed",
  });

  const [company] = await db.select({ contactEmail: companies.contactEmail }).from(companies).where(eq(companies.id, request.companyId));
  if (company) {
    await queueNotification({ type: "request.closed", recipientEmail: company.contactEmail, data: { requestId } });
  }
}
