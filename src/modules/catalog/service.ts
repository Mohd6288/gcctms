// catalog module — business logic (Server Actions call into here, never touch db/ directly for RLS-scoped ops).
import "server-only";
import { randomBytes } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { courseJobRoles, courses, exams, pricing, profiles, trainers, trainingCenters } from "@/db/schema";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize, type AuthContext } from "@/modules/platform/auth/shared";
import { writeAudit } from "@/modules/platform/audit/service";
import type {
  CreateCourseInput,
  CreateExamInput,
  CreatePricingInput,
  CreateTrainerInput,
  CreateTrainingCenterInput,
  SetCourseJobRolesInput,
  UpdateCourseInput,
  UpdateExamInput,
  UpdateTrainerInput,
  UpdateTrainingCenterInput,
} from "./schema";

function requireCatalogAccess(context: AuthContext | null) {
  if (!authorize("manage_catalog", context)) throw new Error("Not authorized");
}

function requirePricingAccess(context: AuthContext | null) {
  if (!authorize("manage_pricing", context)) throw new Error("Not authorized");
}

function requireTrainerRosterAccess(context: AuthContext | null) {
  if (!authorize("manage_trainer_roster", context)) throw new Error("Not authorized");
}

export async function createCourse(context: AuthContext, input: CreateCourseInput) {
  requireCatalogAccess(context);
  const [course] = await db
    .insert(courses)
    .values({
      code: input.code,
      titleEn: input.titleEn,
      titleAr: input.titleAr,
      description: input.description,
      durationHours: String(input.durationHours),
      minAttendancePct: input.minAttendancePct,
      examId: input.examId,
      validityMonths: input.validityMonths,
    })
    .returning({ id: courses.id });
  await writeAudit({ userId: context.userId, entityType: "course", entityId: course.id, action: "create" });
  return course;
}

export async function updateCourse(context: AuthContext, input: UpdateCourseInput) {
  requireCatalogAccess(context);
  await db
    .update(courses)
    .set({
      code: input.code,
      titleEn: input.titleEn,
      titleAr: input.titleAr,
      description: input.description,
      durationHours: String(input.durationHours),
      minAttendancePct: input.minAttendancePct,
      examId: input.examId ?? null,
      validityMonths: input.validityMonths ?? null,
      active: input.active,
    })
    .where(eq(courses.id, input.courseId));
  await writeAudit({ userId: context.userId, entityType: "course", entityId: input.courseId, action: "update" });
}

// Which job roles are eligible for this course (feeds the certificate
// eligibility gate — see database-schema.md's course_job_roles).
export async function setCourseJobRoles(context: AuthContext, input: SetCourseJobRolesInput) {
  requireCatalogAccess(context);

  const existing = await db
    .select({ id: courseJobRoles.id, jobRoleId: courseJobRoles.jobRoleId })
    .from(courseJobRoles)
    .where(eq(courseJobRoles.courseId, input.courseId));
  const existingIds = new Set(existing.map((e) => e.jobRoleId));
  const wantedIds = new Set(input.jobRoleIds);

  const toRemove = existing.filter((e) => !wantedIds.has(e.jobRoleId));
  const toAdd = input.jobRoleIds.filter((id) => !existingIds.has(id));

  if (toRemove.length > 0) {
    await db.delete(courseJobRoles).where(
      inArray(
        courseJobRoles.id,
        toRemove.map((r) => r.id)
      )
    );
  }
  if (toAdd.length > 0) {
    await db.insert(courseJobRoles).values(toAdd.map((jobRoleId) => ({ courseId: input.courseId, jobRoleId })));
  }
  await writeAudit({ userId: context.userId, entityType: "course", entityId: input.courseId, action: "set_job_roles" });
}

export async function createExam(context: AuthContext, input: CreateExamInput) {
  requireCatalogAccess(context);
  const [exam] = await db.insert(exams).values(input).returning({ id: exams.id });
  await writeAudit({ userId: context.userId, entityType: "exam", entityId: exam.id, action: "create" });
  return exam;
}

export async function updateExam(context: AuthContext, input: UpdateExamInput) {
  requireCatalogAccess(context);
  await db
    .update(exams)
    .set({ code: input.code, title: input.title, passMark: input.passMark, active: input.active })
    .where(eq(exams.id, input.examId));
  await writeAudit({ userId: context.userId, entityType: "exam", entityId: input.examId, action: "update" });
}

export async function createTrainingCenter(context: AuthContext, input: CreateTrainingCenterInput) {
  requireCatalogAccess(context);
  const [center] = await db.insert(trainingCenters).values(input).returning({ id: trainingCenters.id });
  await writeAudit({ userId: context.userId, entityType: "training_center", entityId: center.id, action: "create" });
  return center;
}

export async function updateTrainingCenter(context: AuthContext, input: UpdateTrainingCenterInput) {
  requireCatalogAccess(context);
  await db
    .update(trainingCenters)
    .set({ name: input.name, city: input.city, address: input.address, capacity: input.capacity, active: input.active })
    .where(eq(trainingCenters.id, input.centerId));
  await writeAudit({ userId: context.userId, entityType: "training_center", entityId: input.centerId, action: "update" });
}

// region omitted = the default price for the course; a region-specific row
// overrides it for that region only (resolved at read time — see
// requests/service.ts's resolvePrice()).
export async function createPricing(context: AuthContext, input: CreatePricingInput) {
  requirePricingAccess(context);
  const [row] = await db
    .insert(pricing)
    .values({
      courseId: input.courseId,
      region: input.region,
      price: String(input.price),
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
    })
    .returning({ id: pricing.id });
  await writeAudit({ userId: context.userId, entityType: "pricing", entityId: row.id, action: "create" });
  return row;
}

// Ends an existing price's validity (e.g. before adding a new one that
// starts where this one leaves off) rather than deleting it — pricing
// history stays intact for past invoices.
export async function endPricing(context: AuthContext, pricingId: number, effectiveTo: string) {
  requirePricingAccess(context);
  await db.update(pricing).set({ effectiveTo }).where(eq(pricing.id, pricingId));
  await writeAudit({ userId: context.userId, entityType: "pricing", entityId: pricingId, action: "end" });
}

// Distinct from Phase 2's superadmin/users screen (generic manage_users
// account creation) — this is the catalog-adjacent roster view, capturing
// trainer-specific fields (qualifications) under manage_trainer_roster.
export async function createTrainer(context: AuthContext, input: CreateTrainerInput) {
  requireTrainerRosterAccess(context);

  const tempPassword = randomBytes(12).toString("base64url");
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({ email: input.email, password: tempPassword, email_confirm: true });
  if (error || !data.user) {
    throw new Error(error?.code === "email_exists" ? "An account with this email already exists." : "Could not create account.");
  }

  try {
    const [trainer] = await db
      .insert(trainers)
      .values({ userId: data.user.id, fullName: input.fullName, qualifications: input.qualifications })
      .returning({ id: trainers.id });
    await db.insert(profiles).values({ userId: data.user.id, role: "trainer", fullName: input.fullName, trainerId: trainer.id });
    await writeAudit({ userId: context.userId, entityType: "trainer", entityId: trainer.id, action: "create" });
    return { trainerId: trainer.id, email: input.email, tempPassword };
  } catch (err) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw err;
  }
}

export async function updateTrainer(context: AuthContext, input: UpdateTrainerInput) {
  requireTrainerRosterAccess(context);
  await db
    .update(trainers)
    .set({ fullName: input.fullName, qualifications: input.qualifications, active: input.active })
    .where(eq(trainers.id, input.trainerId));
  await writeAudit({ userId: context.userId, entityType: "trainer", entityId: input.trainerId, action: "update" });
}
