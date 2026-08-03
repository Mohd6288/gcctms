import { sql } from "drizzle-orm";
import { bigint, boolean, check, date, index, integer, numeric, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { timestamptz } from "./_helpers";
import { jobRoles } from "./auth";

export const exams = pgTable("exams", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  code: text("code").notNull().unique(),
  title: text("title").notNull(),
  passMark: integer("pass_mark").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

export const courses = pgTable(
  "courses",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    code: text("code").notNull().unique(),
    titleEn: text("title_en").notNull(),
    titleAr: text("title_ar").notNull(),
    description: text("description"),
    durationHours: numeric("duration_hours", { precision: 5, scale: 2 }).notNull(),
    minAttendancePct: integer("min_attendance_pct").notNull().default(90),
    examId: bigint("exam_id", { mode: "number" }).references(() => exams.id),
    validityMonths: integer("validity_months"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [index("courses_exam_id_idx").on(t.examId)]
);

export const courseJobRoles = pgTable(
  "course_job_roles",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    courseId: bigint("course_id", { mode: "number" }).notNull().references(() => courses.id),
    jobRoleId: bigint("job_role_id", { mode: "number" }).notNull().references(() => jobRoles.id),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("course_job_roles_pair_key").on(t.courseId, t.jobRoleId),
    index("course_job_roles_job_role_id_idx").on(t.jobRoleId),
  ]
);

export const trainingCenters = pgTable("training_centers", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  city: text("city"),
  address: text("address"),
  capacity: integer("capacity"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

export const pricing = pgTable(
  "pricing",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    courseId: bigint("course_id", { mode: "number" }).notNull().references(() => courses.id),
    region: text("region"),
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("SAR"),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("pricing_course_id_idx").on(t.courseId),
    uniqueIndex("pricing_course_region_effective_from_key").on(t.courseId, t.region, t.effectiveFrom),
    check("pricing_region_check", sql`${t.region} is null or ${t.region} in ('North', 'South', 'East', 'West', 'Central')`),
  ]
);
