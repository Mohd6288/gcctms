import { sql } from "drizzle-orm";
import { bigint, boolean, check, date, index, integer, jsonb, numeric, pgTable, primaryKey, text, uniqueIndex } from "drizzle-orm/pg-core";
import { timestamptz } from "./_helpers";
import { jobRoles } from "./auth";

export type CourseDiscipline = "Electrical" | "Mechanical" | "Electrical-Electronics";
export type CourseOutcome = "certificate" | "card";

/**
 * The scoring sheet for a practically-assessed course (0038), e.g. the Cable
 * Technician Evaluation: every criterion is marked once per part. The cable
 * tests carry ONE part each — joint and termination are separate tests with
 * their own code, day and price — so a sitting is 5 marks out of 100.
 *
 * `passRule` is the important field and the reason scores are stored per cell
 * rather than as a total:
 *   - "per_item"  — EVERY criterion, in EVERY part, must reach the threshold.
 *   - "aggregate" — the sum across everything must reach it.
 * For the cable tests the rule is per_item, so 18/16/19/17/10 is 80 out of 100
 * and still a fail, because the last mark is under 70% of its 20.
 */
export interface Rubric {
  passRule: "per_item" | "aggregate";
  parts: { code: string; en: string; ar: string }[];
  criteria: { code: string; max: number; en: string; ar: string }[];
}

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
    // 0039 — the technical discipline of a certification test, which decides
    // which Safe Working Procedures certificate its candidates must hold.
    discipline: text("discipline").$type<CourseDiscipline>(),
    // 0038 — 'card' means an external manufacturer prints the credential and
    // this platform only tracks it (the cable program, CTCT06/08/10/12).
    // Defaults to the existing behaviour, so every course predating 0038 reads
    // exactly as it did.
    outcome: text("outcome").notNull().default("certificate").$type<CourseOutcome>(),
    // How the course is assessed, when a single exam mark won't do. The
    // threshold lives in passMark above, not in here — one number, so the two
    // cannot drift apart.
    //
    // Null means GCC Lab has not supplied the evaluation form yet (0040). Such
    // a test is requestable and schedulable but not markable — the requirement
    // sits at the point of assessment rather than blocking the course from
    // existing, because thirteen of the fourteen forms are still to come.
    rubric: jsonb("rubric").$type<Rubric>(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check(
      "courses_contractor_category_check",
      sql`${t.contractorCategory} is null or ${t.contractorCategory} in ('Distribution', 'Transmission')`
    ),
    check("courses_outcome_check", sql`${t.outcome} in ('certificate', 'card')`),
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

// OR within a group_no, AND across them: an employee satisfies the gate by
// holding a valid certificate for ANY ONE course in EVERY group. Zero rows
// for a course = no prerequisite gate. Before 0039 there was a single
// implicit group, which could only ever say "any one of these" — see
// getPrerequisiteGroups() in catalog/queries.ts.
export const coursePrerequisites = pgTable(
  "course_prerequisites",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    courseId: bigint("course_id", { mode: "number" }).notNull().references(() => courses.id),
    prerequisiteCourseId: bigint("prerequisite_course_id", { mode: "number" }).notNull().references(() => courses.id),
    // 0039 — OR within a group, AND across groups. Everything seeded before
    // 0039 sits in group 1, which is the single OR group the gate used to
    // apply, so no existing course changes meaning.
    groupNo: integer("group_no").notNull().default(1),
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

// The external party in the cable program (0038): it confirms the test date,
// supplies the evaluator, and prints the qualification cards. GCC Lab never
// issues these cards — it sends the pass list and records the handover.
export const manufacturers = pgTable("manufacturers", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  contactName: text("contact_name"),
  // Nullable so a manufacturer can be recorded before anyone knows who
  // receives the pass list; dispatch refuses to send without it.
  contactEmail: text("contact_email"),
  phone: text("phone"),
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
