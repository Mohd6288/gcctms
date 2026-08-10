import { sql } from "drizzle-orm";
import { bigint, boolean, check, date, index, integer, numeric, pgTable, primaryKey, text, uniqueIndex } from "drizzle-orm/pg-core";
import { timestamptz } from "./_helpers";
import { jobRoles } from "./auth";

export const courses = pgTable(
  "courses",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    // NOT globally unique — real GCC Lab source data has the same code appear
    // twice, once per contractor_category (e.g. CSCC10, CTCT01), with
    // different prerequisites/eligible roles/sometimes duration under each.
    // See the two partial unique indexes below instead of a plain .unique().
    code: text("code").notNull(),
    titleEn: text("title_en").notNull(),
    titleAr: text("title_ar").notNull(),
    description: text("description"),
    durationHours: numeric("duration_hours", { precision: 5, scale: 2 }).notNull(),
    minAttendancePct: integer("min_attendance_pct").notNull().default(90),
    // Whether this course is examined and the mark that passes it (0035).
    // Replaces the separate `exams` entity, which existed only to hold these
    // two values and whose pass mark nothing ever enforced.
    examRequired: boolean("exam_required").notNull().default(false),
    passMark: integer("pass_mark"),
    validityMonths: integer("validity_months"),
    contractorCategory: text("contractor_category"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check(
      "courses_contractor_category_check",
      sql`${t.contractorCategory} is null or ${t.contractorCategory} in ('Distribution', 'Transmission')`
    ),
    // A code can have at most one row per contractor_category, PLUS at most
    // one category-agnostic (null) row. Two separate partial indexes because
    // Postgres never treats two NULLs as equal in a unique constraint, so a
    // plain unique(code, contractor_category) would silently allow duplicate
    // null-category rows for the same code.
    uniqueIndex("courses_code_category_key")
      .on(t.code, t.contractorCategory)
      .where(sql`${t.contractorCategory} is not null`),
    uniqueIndex("courses_code_null_category_key")
      .on(t.code)
      .where(sql`${t.contractorCategory} is null`),
  ]
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

// OR-semantics: an employee satisfies course_id's prerequisite gate by
// holding a valid certificate for ANY ONE listed prerequisite_course_id, not
// all of them. Zero rows for a course = no prerequisite gate.
export const coursePrerequisites = pgTable(
  "course_prerequisites",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    courseId: bigint("course_id", { mode: "number" }).notNull().references(() => courses.id),
    prerequisiteCourseId: bigint("prerequisite_course_id", { mode: "number" }).notNull().references(() => courses.id),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("course_prerequisites_pair_key").on(t.courseId, t.prerequisiteCourseId),
    index("course_prerequisites_prerequisite_course_id_idx").on(t.prerequisiteCourseId),
    check("course_prerequisites_not_self", sql`${t.courseId} <> ${t.prerequisiteCourseId}`),
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

// Which courses a trainer is qualified to deliver (0029). Seeded from the
// per-trainer profile sheets in files_TMS/tainers.xlsx via
// scripts/seed-trainers.mjs.
export const trainerCourses = pgTable(
  "trainer_courses",
  {
    trainerId: bigint("trainer_id", { mode: "number" }).notNull(),
    courseId: bigint("course_id", { mode: "number" }).notNull().references(() => courses.id),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.trainerId, t.courseId] }), index("trainer_courses_course_id_idx").on(t.courseId)]
);

// GCC Lab's training-institute cities (0032). Replaces the hardcoded
// REGION_CITIES map so super_admin can add one without a deploy;
// training_requests.preferred_city is a foreign key onto name.
export const cities = pgTable(
  "cities",
  {
    name: text("name").primaryKey(),
    region: text("region").notNull(),
    nameAr: text("name_ar").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("cities_region_idx").on(t.region),
    check("cities_region_check", sql`${t.region} in ('Central', 'East', 'West', 'South')`),
  ]
);
