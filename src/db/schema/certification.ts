import { sql } from "drizzle-orm";
import { bigint, check, date, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { timestamptz } from "./_helpers";
import { companies, employees } from "./auth";
import { courses, manufacturers } from "./catalog";
import { documents } from "./requests";
import { classes } from "./scheduling";

export const certificates = pgTable(
  "certificates",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    employeeId: bigint("employee_id", { mode: "number" }).notNull().references(() => employees.id),
    courseId: bigint("course_id", { mode: "number" }).notNull().references(() => courses.id),
    classId: bigint("class_id", { mode: "number" }).notNull().references(() => classes.id),
    companyId: bigint("company_id", { mode: "number" }).notNull().references(() => companies.id),
    serial: text("serial").unique(),
    status: text("status").notNull().default("pending_approval"),
    eligibility: jsonb("eligibility").notNull(),
    approvedBy: uuid("approved_by"),
    approvedAt: timestamptz("approved_at"),
    issuedAt: timestamptz("issued_at"),
    expiresAt: timestamptz("expires_at"),
    pdfObjectKey: text("pdf_object_key"),
    revokedReason: text("revoked_reason"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("certificates_employee_id_idx").on(t.employeeId),
    index("certificates_company_id_idx").on(t.companyId),
    index("certificates_class_id_idx").on(t.classId),
    index("certificates_status_idx").on(t.status),
    check("certificates_status_check", sql`${t.status} in ('pending_approval', 'issued', 'rejected', 'revoked')`),
  ]
);

/**
 * A manufacturer-issued qualification card (0038) — the cable program's
 * outcome, and deliberately NOT a `certificates` row.
 *
 * The public verify page's whole promise is that a serial it recognises was
 * issued by GCC Lab. These cards are printed by the accessory manufacturer,
 * so filing them as certificates would make that page lie about who stands
 * behind them. The lifecycle differs too: there is nothing to approve and no
 * PDF to render, only a list to send and a handover to record.
 */
export const qualificationCards = pgTable(
  "qualification_cards",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    employeeId: bigint("employee_id", { mode: "number" }).notNull().references(() => employees.id),
    courseId: bigint("course_id", { mode: "number" }).notNull().references(() => courses.id),
    classId: bigint("class_id", { mode: "number" }).notNull().references(() => classes.id),
    companyId: bigint("company_id", { mode: "number" }).notNull().references(() => companies.id),
    manufacturerId: bigint("manufacturer_id", { mode: "number" }).references(() => manufacturers.id),
    status: text("status").notNull().default("awaiting_issuer").$type<QualificationCardStatus>(),
    issuanceType: text("issuance_type").notNull().default("new").$type<"new" | "renewal">(),
    testDate: date("test_date").notNull(),
    // Two years from the test date — ارشادات حضور الاختبارات: "ومدتها عامين من
    // تاريخ الاختبار". Set when the manufacturer reports the card issued.
    expiresAt: date("expires_at"),
    // Comes back from the manufacturer; unknown until they print it.
    cardNumber: text("card_number"),
    // The same six gate inputs a certificate records, so an auditor can see
    // why the card was earned without recomputing it.
    eligibility: jsonb("eligibility").notNull(),
    dispatchedAt: timestamptz("dispatched_at"),
    issuedAt: timestamptz("issued_at"),
    collectedAt: timestamptz("collected_at"),
    // نموذج الغياب و استلام البطاقات: who physically took the card. Often the
    // contractor's representative rather than the technician.
    collectedByName: text("collected_by_name"),
    collectedByMobile: text("collected_by_mobile"),
    receiptDocumentId: bigint("receipt_document_id", { mode: "number" }).references(() => documents.id),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    // The idempotency guard certificates rely on: one card per technician per
    // sitting, so re-running the gate cannot mint a second.
    uniqueIndex("qualification_cards_employee_class_key").on(t.employeeId, t.classId),
    index("qualification_cards_company_id_idx").on(t.companyId),
    index("qualification_cards_class_id_idx").on(t.classId),
    index("qualification_cards_status_idx").on(t.status),
    index("qualification_cards_expires_at_idx").on(t.expiresAt),
    check(
      "qualification_cards_status_check",
      sql`${t.status} in ('awaiting_issuer', 'issued', 'collected', 'expired', 'void')`
    ),
    check("qualification_cards_issuance_type_check", sql`${t.issuanceType} in ('new', 'renewal')`),
  ]
);

export type QualificationCardStatus = "awaiting_issuer" | "issued" | "collected" | "expired" | "void";

// Proof of what GCC Lab told the card issuer, and when (step 9). The snapshot
// is kept rather than recomputed: who was on the list at the moment it was
// sent is a different question from who would be on it now.
export const cardDispatches = pgTable(
  "card_dispatches",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    classId: bigint("class_id", { mode: "number" }).notNull().references(() => classes.id),
    manufacturerId: bigint("manufacturer_id", { mode: "number" }).notNull().references(() => manufacturers.id),
    recipientEmail: text("recipient_email").notNull(),
    passCount: integer("pass_count").notNull(),
    // The full printing list, identity numbers unmasked, sits in private
    // storage behind a signed link — never in the body of an email that will
    // live in a third party's mailbox forever.
    bucket: text("bucket").notNull(),
    objectKey: text("object_key").notNull(),
    linkExpiresAt: timestamptz("link_expires_at").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    sentBy: uuid("sent_by"),
    sentAt: timestamptz("sent_at").notNull().defaultNow(),
  },
  (t) => [index("card_dispatches_class_id_idx").on(t.classId)]
);
