import { sql } from "drizzle-orm";
import { bigint, check, index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { timestamptz } from "./_helpers";
import { companies, employees } from "./auth";
import { courses } from "./catalog";
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
