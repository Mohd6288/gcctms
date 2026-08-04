// payments module — read-side queries (Drizzle, RLS-scoped via lib/supabase/server.ts).
import "server-only";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { companies, courses, payments, trainingRequests } from "@/db/schema";

export async function getPaymentForRequest(requestId: number) {
  const [payment] = await db
    .select({
      id: payments.id,
      sadadInvoiceRef: payments.sadadInvoiceRef,
      dueDate: payments.dueDate,
      description: payments.description,
      qty: payments.qty,
      unitPrice: payments.unitPrice,
      subtotal: payments.subtotal,
      vatRate: payments.vatRate,
      totalAmount: payments.totalAmount,
      documentId: payments.documentId,
      status: payments.status,
      rejectionReason: payments.rejectionReason,
      verifiedAt: payments.verifiedAt,
    })
    .from(payments)
    .where(eq(payments.requestId, requestId));
  return payment ?? null;
}

// Contractor's own payments across all their requests — mirrors the
// validated prototype's CompanyPayments.tsx list (no separate detail route;
// the "view" link goes to the owning request, where PaymentPanel already
// lives — see requests/[id]/payment-panel.tsx).
export async function listPaymentsForCompany(companyId: number) {
  return db
    .select({
      id: payments.id,
      requestId: payments.requestId,
      courseTitleEn: courses.titleEn,
      courseTitleAr: courses.titleAr,
      totalAmount: payments.totalAmount,
      status: payments.status,
      dueDate: payments.dueDate,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .innerJoin(trainingRequests, eq(payments.requestId, trainingRequests.id))
    .innerJoin(courses, eq(trainingRequests.courseId, courses.id))
    .where(eq(trainingRequests.companyId, companyId))
    .orderBy(desc(payments.createdAt));
}

// Admin verification queue — only payments with an actual receipt attached
// and still awaiting review (status "uploaded" + document_id set; an
// "uploaded" payment with no document yet has nothing to review).
export async function listPaymentsAwaitingVerification() {
  return db
    .select({
      id: payments.id,
      requestId: payments.requestId,
      companyName: companies.name,
      courseTitleEn: courses.titleEn,
      courseTitleAr: courses.titleAr,
      totalAmount: payments.totalAmount,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .innerJoin(trainingRequests, eq(payments.requestId, trainingRequests.id))
    .innerJoin(companies, eq(trainingRequests.companyId, companies.id))
    .innerJoin(courses, eq(trainingRequests.courseId, courses.id))
    .where(and(eq(payments.status, "uploaded"), isNotNull(payments.documentId)))
    .orderBy(desc(payments.createdAt));
}
