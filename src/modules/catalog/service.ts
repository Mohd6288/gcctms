// catalog module — business logic (Server Actions call into here, never touch db/ directly for RLS-scoped ops).
import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import { cities, courseJobRoles, coursePrerequisites, courses, pricing, profiles, trainerCourses, trainers, trainingCenters } from "@/db/schema";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize, type AuthContext } from "@/modules/platform/auth/shared";
import { writeAudit } from "@/modules/platform/audit/service";
import type {
  CreateCityInput,
  CreateTrainerLoginInput,
  SetCityActiveInput,
  CreateCourseInput,
  CreatePricingInput,
  CreateTrainerInput,
  CreateTrainingCenterInput,
  SetCoursePrerequisitesInput,
  SetCourseJobRolesInput,
  UpdateCourseInput,
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
      examRequired: input.examRequired,
      passMark: input.examRequired ? input.passMark : null,
      validityMonths: input.validityMonths,
      contractorCategory: input.contractorCategory,
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
      examRequired: input.examRequired,
      passMark: input.examRequired ? input.passMark : null,
      validityMonths: input.validityMonths ?? null,
      contractorCategory: input.contractorCategory ?? null,
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

// OR-semantics prerequisite chain for the certificate gate — see
// roles-and-workflows.md and requests/service.ts's submitRequest guard.
export async function setCoursePrerequisites(context: AuthContext, input: SetCoursePrerequisitesInput) {
  requireCatalogAccess(context);

  const existing = await db
    .select({ id: coursePrerequisites.id, prerequisiteCourseId: coursePrerequisites.prerequisiteCourseId })
    .from(coursePrerequisites)
    .where(eq(coursePrerequisites.courseId, input.courseId));
  const existingIds = new Set(existing.map((e) => e.prerequisiteCourseId));
  const wantedIds = new Set(input.prerequisiteCourseIds);

  const toRemove = existing.filter((e) => !wantedIds.has(e.prerequisiteCourseId));
  const toAdd = input.prerequisiteCourseIds.filter((id) => !existingIds.has(id));

  if (toRemove.length > 0) {
    await db.delete(coursePrerequisites).where(
      inArray(
        coursePrerequisites.id,
        toRemove.map((r) => r.id)
      )
    );
  }
  if (toAdd.length > 0) {
    await db.insert(coursePrerequisites).values(toAdd.map((prerequisiteCourseId) => ({ courseId: input.courseId, prerequisiteCourseId })));
  }
  await writeAudit({ userId: context.userId, entityType: "course", entityId: input.courseId, action: "set_prerequisites" });
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
// Cities are catalog data, owned by super_admin under manage_catalog — the
// same capability that already owns training_centers. No new capability:
// one implementation, one role.
export async function createCity(context: AuthContext, input: CreateCityInput) {
  if (!authorize("manage_catalog", context)) throw new Error("Not authorized");
  try {
    await db.insert(cities).values({ name: input.name, nameAr: input.nameAr, region: input.region });
  } catch (err) {
    if ((err as { cause?: { code?: string } })?.cause?.code === "23505") {
      throw new Error("A city with this name already exists.");
    }
    throw err;
  }
  await writeAudit({ userId: context.userId, entityType: "city", entityId: 0, action: "create", note: `${input.name} (${input.region})` });
}

// Deactivate, never delete: training_requests.preferred_city is a foreign
// key with ON DELETE RESTRICT, so a city with any request history cannot be
// removed — and shouldn't be, since that history is real.
export async function setCityActive(context: AuthContext, input: SetCityActiveInput) {
  if (!authorize("manage_catalog", context)) throw new Error("Not authorized");
  await db.update(cities).set({ active: input.active, updatedAt: new Date() }).where(eq(cities.name, input.name));
  await writeAudit({ userId: context.userId, entityType: "city", entityId: 0, action: input.active ? "activate" : "deactivate", note: input.name });
}

// Which courses a trainer is certified to deliver. This is the list the
// class scheduling board filters its trainer dropdown by, so it is the one
// that has operational consequences — until now it was only ever written by
// scripts/seed-trainers.mjs and had no UI at all.
//
// Replace-in-place rather than diffing: the set is small and the form always
// submits the complete intended list.
async function setTrainerCourses(trainerId: number, courseIds: number[]) {
  await db.delete(trainerCourses).where(eq(trainerCourses.trainerId, trainerId));
  if (courseIds.length === 0) return;
  await db.insert(trainerCourses).values(courseIds.map((courseId) => ({ trainerId, courseId })));
}

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
      // Store the email: it's how a roster row is matched later (0029's
      // unique index) and how seed-trainers.mjs identifies people.
      .values({ userId: data.user.id, email: input.email, fullName: input.fullName, qualifications: input.qualifications })
      .returning({ id: trainers.id });
    await db.insert(profiles).values({ userId: data.user.id, role: "trainer", fullName: input.fullName, trainerId: trainer.id });
    if (input.courseIds?.length) await setTrainerCourses(trainer.id, input.courseIds);
    await writeAudit({ userId: context.userId, entityType: "trainer", entityId: trainer.id, action: "create" });
    return { trainerId: trainer.id, email: input.email, tempPassword };
  } catch (err) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw err;
  }
}

// Gives an existing roster trainer a login, rather than creating a second
// trainer. createTrainer() inserts a new row, which is right for someone
// being added from scratch but wrong for the 13 seeded from
// files_TMS/tainers.xlsx: doing it that way leaves a duplicate name where
// one row holds the course competencies and the other holds the account.
export async function createTrainerLogin(context: AuthContext, input: CreateTrainerLoginInput) {
  requireTrainerRosterAccess(context);

  const [trainer] = await db
    .select({ id: trainers.id, fullName: trainers.fullName, email: trainers.email, userId: trainers.userId })
    .from(trainers)
    .where(eq(trainers.id, input.trainerId));
  if (!trainer) throw new Error("Trainer not found");
  if (trainer.userId) throw new Error("This trainer already has a login.");
  if (!trainer.email) throw new Error("Add an email to this trainer before creating their login.");

  const tempPassword = randomBytes(12).toString("base64url");
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({ email: trainer.email, password: tempPassword, email_confirm: true });
  if (error || !data.user) {
    throw new Error(error?.code === "email_exists" ? "An account with this email already exists." : "Could not create account.");
  }

  try {
    // Update, not insert — this is the whole point.
    await db.update(trainers).set({ userId: data.user.id }).where(eq(trainers.id, trainer.id));
    await db.insert(profiles).values({ userId: data.user.id, role: "trainer", fullName: trainer.fullName, trainerId: trainer.id });
    await writeAudit({ userId: context.userId, entityType: "trainer", entityId: trainer.id, action: "create_login", note: trainer.email });
    return { email: trainer.email, tempPassword };
  } catch (err) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw err;
  }
}

// Bulk form of the above for onboarding a whole roster at once — the 13
// seeded from tainers.xlsx would otherwise be 13 separate clicks, each
// returning a password that has to be captured before the next one.
// Sequential, not Promise.all: each iteration creates an auth user and
// writes rows, and concurrent Drizzle calls stall against the pooler.
//
// One trainer failing doesn't abandon the rest — the reason comes back per
// trainer so a missing email or an email already taken in Supabase Auth is
// visible rather than silently swallowed.
export async function createAllTrainerLogins(context: AuthContext) {
  requireTrainerRosterAccess(context);

  const candidates = await db
    .select({ id: trainers.id, fullName: trainers.fullName })
    .from(trainers)
    .where(and(isNull(trainers.userId), isNotNull(trainers.email), eq(trainers.active, true)))
    .orderBy(asc(trainers.id));

  const created: { fullName: string; email: string; tempPassword: string }[] = [];
  const failed: { fullName: string; reason: string }[] = [];

  for (const candidate of candidates) {
    try {
      const result = await createTrainerLogin(context, { trainerId: candidate.id });
      created.push({ fullName: candidate.fullName, ...result });
    } catch (err) {
      failed.push({ fullName: candidate.fullName, reason: err instanceof Error ? err.message : "Could not create account." });
    }
  }

  return { created, failed };
}

export async function updateTrainer(context: AuthContext, input: UpdateTrainerInput) {
  requireTrainerRosterAccess(context);
  await db
    .update(trainers)
    .set({ fullName: input.fullName, qualifications: input.qualifications, active: input.active })
    .where(eq(trainers.id, input.trainerId));
  if (input.courseIds) await setTrainerCourses(input.trainerId, input.courseIds);
  await writeAudit({ userId: context.userId, entityType: "trainer", entityId: input.trainerId, action: "update" });
}
