import { sql } from "drizzle-orm";
import { bigint, boolean, check, date, index, integer, jsonb, numeric, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { timestamptz } from "./_helpers";
import { companies, employees, trainers } from "./auth";
import { courses, trainingCenters } from "./catalog";
import { requestItems } from "./requests";

export const classes = pgTable(
  "classes",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    courseId: bigint("course_id", { mode: "number" }).notNull().references(() => courses.id),
    trainerId: bigint("trainer_id", { mode: "number" }).notNull().references(() => trainers.id),
    centerId: bigint("center_id", { mode: "number" }).references(() => trainingCenters.id),
    region: text("region").notNull(),
    type: text("type").notNull(),
    companyId: bigint("company_id", { mode: "number" }).references(() => companies.id),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    sessions: jsonb("sessions").notNull().default([]),
    capacity: integer("capacity").notNull(),
    status: text("status").notNull().default("scheduled"),
    cancelReason: text("cancel_reason"),
    cancelledAt: timestamptz("cancelled_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("classes_trainer_id_idx").on(t.trainerId),
    index("classes_company_id_idx").on(t.companyId),
    index("classes_status_idx").on(t.status),
    check("classes_region_check", sql`${t.region} in ('Central', 'East', 'West', 'South')`),
    check("classes_type_check", sql`${t.type} in ('private', 'public')`),
    check("classes_status_check", sql`${t.status} in ('scheduled', 'in_progress', 'completed', 'cancelled')`),
    // classes_private_requires_company and classes_trainer_no_overlap (the
    // GIST exclusion constraint) are declared directly in the migration —
    // Drizzle's schema builder has no exclusion-constraint API to mirror them.
  ]
);

export const regionalAdminAssignments = pgTable(
  "regional_admin_assignments",
  {
    region: text("region").notNull(),
    // Keyed on the admin since 0030: one region per admin, any number of
    // admins per region.
    adminUserId: uuid("admin_user_id").notNull(),
    assignedAt: timestamptz("assigned_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.adminUserId] }),
    index("regional_admin_assignments_region_idx").on(t.region),
    check("regional_admin_assignments_region_check", sql`${t.region} in ('Central', 'East', 'West', 'South')`),
  ]
);

export const classEnrollments = pgTable(
  "class_enrollments",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    classId: bigint("class_id", { mode: "number" }).notNull().references(() => classes.id),
    requestItemId: bigint("request_item_id", { mode: "number" }).notNull().references(() => requestItems.id),
    employeeId: bigint("employee_id", { mode: "number" }).notNull().references(() => employees.id),
    companyId: bigint("company_id", { mode: "number" }).notNull().references(() => companies.id),
    status: text("status").notNull().default("waitlisted"),
    attendancePct: numeric("attendance_pct", { precision: 5, scale: 2 }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("class_enrollments_class_employee_key").on(t.classId, t.employeeId),
    index("class_enrollments_class_id_idx").on(t.classId),
    index("class_enrollments_employee_id_idx").on(t.employeeId),
    index("class_enrollments_company_id_idx").on(t.companyId),
    check(
      "class_enrollments_status_check",
      sql`${t.status} in ('waitlisted', 'enrolled', 'attended_complete', 'no_show', 'withdrawn')`
    ),
  ]
);

export const attendance = pgTable(
  "attendance",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    classId: bigint("class_id", { mode: "number" }).notNull().references(() => classes.id),
    sessionDate: date("session_date").notNull(),
    employeeId: bigint("employee_id", { mode: "number" }).notNull().references(() => employees.id),
    present: boolean("present").notNull(),
    recordedBy: uuid("recorded_by").notNull(),
    recordedAt: timestamptz("recorded_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("attendance_class_session_employee_key").on(t.classId, t.sessionDate, t.employeeId),
    index("attendance_class_id_idx").on(t.classId),
    index("attendance_employee_id_idx").on(t.employeeId),
  ]
);

export const examResults = pgTable(
  "exam_results",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    enrollmentId: bigint("enrollment_id", { mode: "number" }).notNull().references(() => classEnrollments.id),
    score: integer("score").notNull(),
    result: text("result").notNull(),
    attemptNo: integer("attempt_no").notNull().default(1),
    recordedBy: uuid("recorded_by").notNull(),
    recordedAt: timestamptz("recorded_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("exam_results_enrollment_attempt_key").on(t.enrollmentId, t.attemptNo),
    index("exam_results_enrollment_id_idx").on(t.enrollmentId),
    check("exam_results_result_check", sql`${t.result} in ('pass', 'fail')`),
  ]
);
