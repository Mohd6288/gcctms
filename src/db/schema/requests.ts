import { sql } from "drizzle-orm";
import { bigint, check, date, index, integer, numeric, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { timestamptz } from "./_helpers";
import { companies, employees } from "./auth";
import { courses } from "./catalog";

export const trainingRequests = pgTable(
  "training_requests",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    companyId: bigint("company_id", { mode: "number" }).notNull().references(() => companies.id),
    requestedBy: uuid("requested_by").notNull(),
    courseId: bigint("course_id", { mode: "number" }).notNull().references(() => courses.id),
    preferredRegion: text("preferred_region"),
    preferredCity: text("preferred_city"),
    preferredTrainingType: text("preferred_training_type"),
    preferredStartDate: date("preferred_start_date"),
    preferredEndDate: date("preferred_end_date"),
    notes: text("notes"),
    status: text("status").notNull().default("draft"),
    totalAmount: numeric("total_amount", { precision: 10, scale: 2 }),
    adminNote: text("admin_note"),
    rejectedReason: text("rejected_reason"),
    closedAt: timestamptz("closed_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("training_requests_company_id_idx").on(t.companyId),
    index("training_requests_course_id_idx").on(t.courseId),
    index("training_requests_status_idx").on(t.status),
    check(
      "training_requests_status_check",
      sql`${t.status} in ('draft', 'submitted', 'info_requested', 'rejected', 'payment_pending', 'ready_for_scheduling', 'scheduled', 'completed')`
    ),
  ]
);

export const requestItems = pgTable(
  "request_items",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    requestId: bigint("request_id", { mode: "number" }).notNull().references(() => trainingRequests.id),
    employeeId: bigint("employee_id", { mode: "number" }).notNull().references(() => employees.id),
    courseId: bigint("course_id", { mode: "number" }).notNull().references(() => courses.id),
    status: text("status").notNull().default("pending"),
    decision: text("decision").notNull().default("pending"),
    decisionReason: text("decision_reason"),
    decidedBy: uuid("decided_by"),
    decidedAt: timestamptz("decided_at"),
    // Scheduling-board pooling step: assigned to a region before any
    // specific class exists. "In the pool" = billable + ready_for_scheduling
    // + no class_enrollments row yet for this item; see
    // 0021_request_items_assigned_region.sql.
    assignedRegion: text("assigned_region"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("request_items_request_employee_course_key").on(t.requestId, t.employeeId, t.courseId),
    index("request_items_request_id_idx").on(t.requestId),
    index("request_items_employee_id_idx").on(t.employeeId),
    index("request_items_status_idx").on(t.status),
    check("request_items_status_check", sql`${t.status} in ('pending', 'enrolled', 'completed', 'failed', 'withdrawn')`),
    check("request_items_decision_check", sql`${t.decision} in ('pending', 'approved', 'rejected')`),
    check(
      "request_items_assigned_region_check",
      sql`${t.assignedRegion} is null or ${t.assignedRegion} in ('North', 'South', 'East', 'West', 'Central')`
    ),
  ]
);

export const documents = pgTable(
  "documents",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    companyId: bigint("company_id", { mode: "number" }).notNull().references(() => companies.id),
    employeeId: bigint("employee_id", { mode: "number" }).references(() => employees.id),
    requestId: bigint("request_id", { mode: "number" }).references(() => trainingRequests.id),
    type: text("type").notNull(),
    // Set only on a prior_certificate that the contractor filed as a
    // structured external certificate (0027) — course it certifies plus its
    // own validity window, so the prerequisite gate can read it.
    courseId: bigint("course_id", { mode: "number" }).references(() => courses.id),
    issuedAt: date("issued_at"),
    expiresAt: date("expires_at"),
    bucket: text("bucket").notNull(),
    objectKey: text("object_key").notNull().unique(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    checksumSha256: text("checksum_sha256").notNull(),
    uploadedBy: uuid("uploaded_by").notNull(),
    verifiedBy: uuid("verified_by"),
    verifiedAt: timestamptz("verified_at"),
    rejectedBy: uuid("rejected_by"),
    rejectedAt: timestamptz("rejected_at"),
    rejectionReason: text("rejection_reason"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("documents_company_id_idx").on(t.companyId),
    index("documents_employee_id_idx").on(t.employeeId),
    index("documents_request_id_idx").on(t.requestId),
    check(
      "documents_type_check",
      sql`${t.type} in ('national_id', 'prior_certificate', 'sadad_invoice', 'generated_certificate', 'registration_sheet', 'hrbl_request_form', 'other')`
    ),
    check("documents_not_verified_and_rejected", sql`${t.verifiedAt} is null or ${t.rejectedAt} is null`),
    check(
      "documents_external_cert_shape",
      sql`(${t.courseId} is null and ${t.issuedAt} is null and ${t.expiresAt} is null)
        or (${t.type} = 'prior_certificate' and ${t.courseId} is not null and ${t.expiresAt} is not null)`
    ),
  ]
);

// The contractor's estimate multiplies by this before approval exists, and
// payments.vat_rate defaults to it afterwards. Derived rather than written
// twice so the number the wizard shows and the number the invoice computes
// cannot drift apart. Changing VAT means changing this AND a migration for
// the column default — existing rows keep their own stored rate.
export const DEFAULT_VAT_RATE = 0.15;

export const payments = pgTable(
  "payments",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    requestId: bigint("request_id", { mode: "number" }).notNull().references(() => trainingRequests.id),
    sadadInvoiceRef: text("sadad_invoice_ref"),
    dueDate: date("due_date"),
    description: text("description").notNull(),
    qty: integer("qty").notNull(),
    unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
    subtotal: numeric("subtotal", { precision: 10, scale: 2 }).generatedAlwaysAs(sql`(qty * unit_price)`),
    vatRate: numeric("vat_rate", { precision: 4, scale: 3 }).notNull().default(String(DEFAULT_VAT_RATE)),
    totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).generatedAlwaysAs(
      sql`(qty * unit_price * (1 + vat_rate))`
    ),
    documentId: bigint("document_id", { mode: "number" }).references(() => documents.id),
    status: text("status").notNull().default("uploaded"),
    verifiedBy: uuid("verified_by"),
    verifiedAt: timestamptz("verified_at"),
    rejectionReason: text("rejection_reason"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("payments_request_id_idx").on(t.requestId),
    index("payments_status_idx").on(t.status),
    check("payments_status_check", sql`${t.status} in ('uploaded', 'verified', 'rejected')`),
  ]
);
