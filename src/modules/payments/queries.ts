// payments module — read-side queries (Drizzle, RLS-scoped via lib/supabase/server.ts).
import "server-only";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, courses, documents, payments, trainingRequests } from "@/db/schema";

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
      documentMimeType: documents.mimeType,
      // The admin-uploaded Dynamics quotation for this request. Left-joined
      // separately from the receipt: one is what GCC Lab issued, the other
      // is what the contractor paid against it, and both can be absent.
      quotationDocumentId: sql<number | null>`(
        select d.id::int from documents d
        where d.request_id = ${payments.requestId} and d.type = 'quotation' limit 1
      )`,
      quotationMimeType: sql<string | null>`(
        select d.mime_type from documents d
        where d.request_id = ${payments.requestId} and d.type = 'quotation' limit 1
      )`,
      quotationName: sql<string | null>`(
        select d.original_name from documents d
        where d.request_id = ${payments.requestId} and d.type = 'quotation' limit 1
      )`,
      status: payments.status,
      rejectionReason: payments.rejectionReason,
      verifiedAt: payments.verifiedAt,
    })
    .from(payments)
    .leftJoin(documents, eq(documents.id, payments.documentId))
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

// The queue that sits BEFORE the verification one: approved requests whose
// quotation GCC Lab still owes the contractor.
//
// Without this an approved request is in no admin list at all —
// listSubmittedRequestsForAdmin drops it the moment it stops being
// "submitted", and the verification queue below only picks it up once a
// receipt exists, which cannot happen until the quotation is uploaded. The
// request page holding the upload box was reachable only by typing its URL.
//
// Keyed on the request still being payment_pending, not merely on a missing
// quotation: requests settled before 0034 have no quotation document and
// would otherwise sit in this queue forever.
export async function listPaymentsAwaitingQuotation(region?: string | null) {
  const missingQuotation = sql`not exists (
    select 1 from documents d where d.request_id = ${payments.requestId} and d.type = 'quotation'
  )`;
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
    .where(
      region
        ? and(eq(trainingRequests.status, "payment_pending"), missingQuotation, eq(companies.region, region))
        : and(eq(trainingRequests.status, "payment_pending"), missingQuotation)
    )
    .orderBy(desc(payments.createdAt));
}

// Admin verification queue — only payments with an actual receipt attached
// and still awaiting review (status "uploaded" + document_id set; an
// "uploaded" payment with no document yet has nothing to review).
//
// region: Drizzle bypasses RLS, so a region-assigned platform_admin
// (Phase 5) needs this filter applied explicitly here too — see
// companies/queries.ts's listCompanies() for the same note.
export async function listPaymentsAwaitingVerification(region?: string | null) {
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
    .where(
      region
        ? and(eq(payments.status, "uploaded"), isNotNull(payments.documentId), eq(companies.region, region))
        : and(eq(payments.status, "uploaded"), isNotNull(payments.documentId))
    )
    .orderBy(desc(payments.createdAt));
}
