// payments module — business logic (Server Actions call into here, never touch db/ directly for RLS-scoped ops).
import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { companies, payments, trainingRequests } from "@/db/schema";
import { authorize, type AuthContext } from "@/modules/platform/auth/shared";
import { writeAudit } from "@/modules/platform/audit/service";
import { notifyPlatformAdmins, queueNotification } from "@/modules/platform/notifications/service";
import { uploadDocument } from "@/modules/platform/storage/service";
import { assertTransition as assertRequestTransition } from "@/modules/requests/machine";
import { assertTransition, type PaymentStatus } from "./machine";

// Mirrors training_requests' contractor policy pattern (own company only);
// platform_admin has blanket access.
function assertContractorOwnsRequest(context: AuthContext, request: { companyId: number }) {
  if (context.role === "platform_admin") return;
  if (context.role === "contractor_manager" && context.companyId === request.companyId) return;
  throw new Error("Not authorized");
}

async function getPaymentByRequestId(requestId: number) {
  const [payment] = await db.select().from(payments).where(eq(payments.requestId, requestId));
  if (!payment) throw new Error("Payment not found");
  return payment;
}

// The contractor's SADAD receipt upload. The payment row already exists
// (created "uploaded" at request-approval time, Phase 4) — the first ever
// upload just attaches a document (status stays "uploaded"); a re-upload
// after rejection is the one real transition (rejected -> uploaded).
export async function uploadPaymentReceipt(context: AuthContext, requestId: number, file: File) {
  if (!authorize("upload_payment", context)) throw new Error("Not authorized");

  const [request] = await db.select().from(trainingRequests).where(eq(trainingRequests.id, requestId));
  if (!request) throw new Error("Request not found");
  assertContractorOwnsRequest(context, request);

  const payment = await getPaymentByRequestId(requestId);
  if (payment.status === "verified") throw new Error("This payment has already been verified.");
  if (payment.status === "rejected") {
    assertTransition(payment.status as PaymentStatus, "uploaded");
  }

  const doc = await uploadDocument(context, {
    companyId: request.companyId,
    requestId,
    type: "sadad_invoice",
    file,
  });

  await db.update(payments).set({ documentId: doc.id, status: "uploaded", rejectionReason: null }).where(eq(payments.id, payment.id));
  await writeAudit({ userId: context.userId, entityType: "payment", entityId: payment.id, action: "upload_receipt", toStatus: "uploaded" });
  await notifyPlatformAdmins("payment.uploaded", { requestId, paymentId: payment.id });

  return { id: payment.id };
}

// Requires a receipt to actually be attached — can't verify an invoice that
// has nothing to check yet. Verifying additionally moves the covering
// request payment_pending -> ready_for_scheduling (roles-and-workflows.md).
export async function verifyPayment(context: AuthContext, paymentId: number) {
  if (!authorize("verify_payments", context)) throw new Error("Not authorized");

  const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId));
  if (!payment) throw new Error("Payment not found");
  if (!payment.documentId) throw new Error("Cannot verify a payment with no receipt attached.");
  assertTransition(payment.status as PaymentStatus, "verified");

  await db
    .update(payments)
    .set({ status: "verified", verifiedBy: context.userId, verifiedAt: new Date() })
    .where(eq(payments.id, paymentId));
  await writeAudit({ userId: context.userId, entityType: "payment", entityId: paymentId, action: "verify", toStatus: "verified" });

  const [request] = await db.select().from(trainingRequests).where(eq(trainingRequests.id, payment.requestId));
  if (!request) return;

  const [company] = await db.select({ contactEmail: companies.contactEmail }).from(companies).where(eq(companies.id, request.companyId));

  if (request.status === "payment_pending") {
    assertRequestTransition("payment_pending", "ready_for_scheduling");
    await db.update(trainingRequests).set({ status: "ready_for_scheduling" }).where(eq(trainingRequests.id, request.id));
    await writeAudit({
      userId: context.userId,
      entityType: "training_request",
      entityId: request.id,
      action: "payment_verified",
      fromStatus: "payment_pending",
      toStatus: "ready_for_scheduling",
    });
  }

  if (company) {
    await queueNotification({ type: "payment.verified", recipientEmail: company.contactEmail, data: { paymentId, requestId: request.id } });
  }
}

export async function rejectPayment(context: AuthContext, paymentId: number, reason: string) {
  if (!authorize("verify_payments", context)) throw new Error("Not authorized");

  const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId));
  if (!payment) throw new Error("Payment not found");
  assertTransition(payment.status as PaymentStatus, "rejected");

  await db.update(payments).set({ status: "rejected", rejectionReason: reason }).where(eq(payments.id, paymentId));
  await writeAudit({ userId: context.userId, entityType: "payment", entityId: paymentId, action: "reject", toStatus: "rejected", note: reason });

  const [request] = await db.select().from(trainingRequests).where(eq(trainingRequests.id, payment.requestId));
  if (request) {
    const [company] = await db.select({ contactEmail: companies.contactEmail }).from(companies).where(eq(companies.id, request.companyId));
    if (company) {
      await queueNotification({ type: "payment.rejected", recipientEmail: company.contactEmail, data: { paymentId, reason } });
    }
  }
}
