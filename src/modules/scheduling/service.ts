// scheduling module — business logic (Server Actions call into here, never touch db/ directly for RLS-scoped ops).
import "server-only";
import { and, asc, count, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { attendance, certificates, classEnrollments, classes, companies, employees, examResults, regionalAdminAssignments, requestItems, trainerCourses, trainingRequests } from "@/db/schema";
import { authorize, type AuthContext } from "@/modules/platform/auth/shared";
import { REGIONS as REGIONS_ORDER } from "@/lib/regions";
import { writeAudit } from "@/modules/platform/audit/service";
import { GuardError } from "@/modules/platform/guard-error";
import { getTrainerEmail, queueNotification } from "@/modules/platform/notifications/service";
import { listActiveEnrollmentRequestItemIds, listSchedulableRequestItems } from "./queries";
import type { AssignRequestItemRegionInput, CancelClassInput, CreateClassInput, EnrollRequestItemInput, MoveEnrollmentInput, SetAdminRegionInput, UpdateClassInput } from "./schema";

function requireScheduleAccess(context: AuthContext | null) {
  if (!authorize("schedule_classes", context)) throw new Error("Not authorized");
}

async function getClassOrThrow(classId: number) {
  const [cls] = await db.select().from(classes).where(eq(classes.id, classId));
  if (!cls) throw new Error("Class not found");
  return cls;
}

export async function assignRequestItemRegion(context: AuthContext, input: AssignRequestItemRegionInput) {
  requireScheduleAccess(context);
  await db.update(requestItems).set({ assignedRegion: input.region }).where(eq(requestItems.id, input.requestItemId));
}

export async function unassignRequestItemRegion(context: AuthContext, requestItemId: number) {
  requireScheduleAccess(context);
  await db.update(requestItems).set({ assignedRegion: null }).where(eq(requestItems.id, requestItemId));
}

// Assigns every still-unassigned pooled employee to their request's
// preferred_region (round-robin fallback for the rare case it's unset —
// unlike the validated prototype, preferred_region is genuinely nullable
// here). Deliberately named for what it does — the validated prototype
// calls an equivalent action "random" while actually assigning by
// preference; naming it accurately here per the skill's guidance.
export async function autoAssignPooledByPreference(context: AuthContext) {
  requireScheduleAccess(context);
  const [pooled, activeIds] = await Promise.all([listSchedulableRequestItems(), listActiveEnrollmentRequestItemIds()]);
  const unassigned = pooled.filter((p) => !activeIds.has(p.requestItemId) && !p.assignedRegion);

  for (let i = 0; i < unassigned.length; i++) {
    const region = unassigned[i].preferredRegion ?? REGIONS_ORDER[i % REGIONS_ORDER.length];
    await db.update(requestItems).set({ assignedRegion: region }).where(eq(requestItems.id, unassigned[i].requestItemId));
  }
  return { assigned: unassigned.length };
}

// Regional admin assignment is super_admin-only (manage_users capability),
// distinct from schedule_classes — matches roles-and-workflows.md. An admin
// holds at most one region, but a region can have any number of admins
// (0030_many_admins_per_region.sql moved the primary key onto the admin).
// region: null clears the assignment, which means UNSCOPED — the admin then
// sees every region, per auth_region()'s null semantics. Delete-then-insert
// rather than an upsert on region: region stopped being unique, so a
// region-targeted ON CONFLICT no longer has an arbiter to match.
export async function setAdminRegion(context: AuthContext, input: SetAdminRegionInput) {
  if (!authorize("manage_users", context)) throw new Error("Not authorized");
  await db.transaction(async (tx) => {
    await tx.delete(regionalAdminAssignments).where(eq(regionalAdminAssignments.adminUserId, input.adminUserId));
    if (input.region) {
      await tx.insert(regionalAdminAssignments).values({ region: input.region, adminUserId: input.adminUserId });
    }
  });
}

function isExclusionViolation(err: unknown): boolean {
  return (err as { cause?: { code?: string } })?.cause?.code === "23P01";
}

// course_id and region are immutable after creation — UpdateClassInput
// structurally excludes both. Trainer double-booking is enforced by the DB
// itself (classes_trainer_no_overlap, a GIST exclusion constraint in
// 0011_scheduling.sql) — stronger than "block it in application code",
// since it can't be bypassed by any code path at all, including a future
// admin script. This function just turns that violation into a readable
// error instead of a raw Postgres exception.
// GCC Lab deliberately allows an uncertified trainer on a class — when there
// aren't enough instructors, an admin has to be able to override. So this
// records rather than blocks: the class is created either way, but the audit
// row says the override happened, and "who put an uncertified trainer on
// CSCC10" has an answer six months later.
async function unqualifiedOverrideNote(trainerId: number, courseId: number): Promise<string | undefined> {
  const [row] = await db
    .select({ courseId: trainerCourses.courseId })
    .from(trainerCourses)
    .where(and(eq(trainerCourses.trainerId, trainerId), eq(trainerCourses.courseId, courseId)));
  return row ? undefined : "Trainer is not certified for this course (override)";
}

export async function createClass(context: AuthContext, input: CreateClassInput) {
  requireScheduleAccess(context);
  if (input.type === "private" && !input.companyId) {
    throw new GuardError("A private class requires a company.");
  }

  try {
    const [cls] = await db
      .insert(classes)
      .values({
        courseId: input.courseId,
        trainerId: input.trainerId,
        centerId: input.centerId,
        region: input.region,
        type: input.type,
        companyId: input.type === "private" ? input.companyId : undefined,
        startDate: input.startDate,
        endDate: input.endDate,
        capacity: input.capacity,
      })
      .returning({ id: classes.id });
    await writeAudit({
      userId: context.userId,
      entityType: "class",
      entityId: cls.id,
      action: "create",
      toStatus: "scheduled",
      note: await unqualifiedOverrideNote(input.trainerId, input.courseId),
    });
    return cls;
  } catch (err) {
    if (isExclusionViolation(err)) {
      throw new GuardError("This trainer already has another class scheduled with overlapping dates.");
    }
    throw err;
  }
}

export async function updateClass(context: AuthContext, input: UpdateClassInput) {
  requireScheduleAccess(context);
  const cls = await getClassOrThrow(input.classId);
  if (cls.status === "cancelled" || cls.status === "completed") {
    throw new GuardError(`Can't edit a class that's ${cls.status}.`);
  }

  const [{ value: enrolledCount }] = await db
    .select({ value: count() })
    .from(classEnrollments)
    .where(and(eq(classEnrollments.classId, input.classId), eq(classEnrollments.status, "enrolled")));
  if (input.capacity < enrolledCount) {
    throw new GuardError(`Capacity can't be less than the ${enrolledCount} employees already enrolled.`);
  }

  try {
    await db
      .update(classes)
      .set({ trainerId: input.trainerId, centerId: input.centerId, startDate: input.startDate, endDate: input.endDate, capacity: input.capacity })
      .where(eq(classes.id, input.classId));
  } catch (err) {
    if (isExclusionViolation(err)) {
      throw new GuardError("This trainer already has another class scheduled with overlapping dates.");
    }
    throw err;
  }
  await writeAudit({
    userId: context.userId,
    entityType: "class",
    entityId: input.classId,
    action: "update",
    note: await unqualifiedOverrideNote(input.trainerId, cls.courseId),
  });

  if (input.capacity > cls.capacity) {
    await promoteFromWaitlist(input.classId, input.capacity - enrolledCount);
  }
}

export async function startClass(context: AuthContext, classId: number) {
  requireScheduleAccess(context);
  const cls = await getClassOrThrow(classId);
  if (cls.status !== "scheduled") throw new Error(`Can't start a class that's ${cls.status}.`);
  await db.update(classes).set({ status: "in_progress" }).where(eq(classes.id, classId));
  await writeAudit({ userId: context.userId, entityType: "class", entityId: classId, action: "start", fromStatus: "scheduled", toStatus: "in_progress" });
}

// Clears every enrollment's link entirely (not a soft withdraw) so affected
// employees fall straight back into their region's scheduling pool
// (assigned_region on request_items is untouched) — matches the validated
// prototype's cancelClass() exactly. Reverts any parent request that had
// become scheduled/completed because of this class.
export async function cancelClass(context: AuthContext, input: CancelClassInput) {
  requireScheduleAccess(context);
  const cls = await getClassOrThrow(input.classId);
  if (cls.status === "cancelled" || cls.status === "completed") {
    throw new Error(`Can't cancel a class that's already ${cls.status}.`);
  }

  const enrollments = await db.select().from(classEnrollments).where(eq(classEnrollments.classId, input.classId));

  await db.update(classes).set({ status: "cancelled", cancelReason: input.reason, cancelledAt: new Date() }).where(eq(classes.id, input.classId));

  if (enrollments.length > 0) {
    await db.delete(classEnrollments).where(eq(classEnrollments.classId, input.classId));
    await db.update(requestItems).set({ status: "pending" }).where(
      inArray(requestItems.id, enrollments.map((e) => e.requestItemId))
    );

    const affectedItems = await db
      .select({ requestId: requestItems.requestId })
      .from(requestItems)
      .where(inArray(requestItems.id, enrollments.map((e) => e.requestItemId)));
    const affectedRequestIds = [...new Set(affectedItems.map((i) => i.requestId))];
    if (affectedRequestIds.length > 0) {
      await db
        .update(trainingRequests)
        .set({ status: "ready_for_scheduling" })
        .where(and(inArray(trainingRequests.id, affectedRequestIds), inArray(trainingRequests.status, ["scheduled", "completed"])));
    }
  }

  await writeAudit({
    userId: context.userId,
    entityType: "class",
    entityId: input.classId,
    action: "cancel",
    fromStatus: cls.status,
    toStatus: "cancelled",
    note: input.reason,
  });

  const affectedCompanyIds = [...new Set(enrollments.map((e) => e.companyId))];
  for (const companyId of affectedCompanyIds) {
    const [company] = await db.select({ contactEmail: companies.contactEmail }).from(companies).where(eq(companies.id, companyId));
    if (company) await queueNotification({ type: "class.cancelled", recipientEmail: company.contactEmail, data: { classId: input.classId, reason: input.reason } });
  }
  const trainerEmail = await getTrainerEmail(cls.trainerId);
  if (trainerEmail) await queueNotification({ type: "class.cancelled", recipientEmail: trainerEmail, data: { classId: input.classId, reason: input.reason } });
}

async function notifyEnrolled(classId: number, companyId: number, trainerId: number, employeeId: number) {
  const [company] = await db.select({ contactEmail: companies.contactEmail }).from(companies).where(eq(companies.id, companyId));
  if (company) await queueNotification({ type: "class.scheduled", recipientEmail: company.contactEmail, data: { classId, employeeId } });
  const trainerEmail = await getTrainerEmail(trainerId);
  if (trainerEmail) await queueNotification({ type: "class.scheduled", recipientEmail: trainerEmail, data: { classId, employeeId } });
}

// Derived, not a direct transition (roles-and-workflows.md): true only once
// every billable request item's active enrollment has actually seated
// (enrolled/attended_complete, not waitlisted) in a non-cancelled class.
async function maybeMarkRequestScheduled(requestId: number) {
  const [request] = await db.select({ status: trainingRequests.status }).from(trainingRequests).where(eq(trainingRequests.id, requestId));
  if (!request || request.status !== "ready_for_scheduling") return;

  const items = await db.select({ id: requestItems.id, decision: requestItems.decision }).from(requestItems).where(eq(requestItems.requestId, requestId));
  const billableIds = items.filter((i) => i.decision !== "rejected").map((i) => i.id);
  if (billableIds.length === 0) return;

  const activeEnrollments = await db
    .select({ requestItemId: classEnrollments.requestItemId, status: classEnrollments.status })
    .from(classEnrollments)
    .innerJoin(classes, eq(classEnrollments.classId, classes.id))
    .where(and(inArray(classEnrollments.requestItemId, billableIds), ne(classes.status, "cancelled")));

  const seated = new Set(activeEnrollments.filter((e) => e.status === "enrolled" || e.status === "attended_complete").map((e) => e.requestItemId));
  if (billableIds.every((id) => seated.has(id))) {
    await db.update(trainingRequests).set({ status: "scheduled" }).where(eq(trainingRequests.id, requestId));
    await writeAudit({ userId: null, entityType: "training_request", entityId: requestId, action: "auto_mark_scheduled", fromStatus: "ready_for_scheduling", toStatus: "scheduled" });
  }
}

// Over capacity -> FIFO waitlist instead of rejecting outright. A no-op if
// the employee is already enrolled/waitlisted in this class.
export async function enrollRequestItem(context: AuthContext, input: EnrollRequestItemInput) {
  requireScheduleAccess(context);
  const cls = await getClassOrThrow(input.classId);
  if (cls.status === "cancelled") throw new Error("Can't enroll into a cancelled class.");

  const [item] = await db.select().from(requestItems).where(eq(requestItems.id, input.requestItemId));
  if (!item) throw new Error("Request item not found.");

  const alreadyThere = await db
    .select({ id: classEnrollments.id })
    .from(classEnrollments)
    .where(and(eq(classEnrollments.classId, input.classId), eq(classEnrollments.employeeId, item.employeeId)));
  if (alreadyThere.length > 0) return;

  const [employee] = await db.select({ companyId: employees.companyId }).from(employees).where(eq(employees.id, item.employeeId));
  if (!employee) throw new Error("Employee not found.");

  const [{ value: enrolledCount }] = await db
    .select({ value: count() })
    .from(classEnrollments)
    .where(and(eq(classEnrollments.classId, input.classId), eq(classEnrollments.status, "enrolled")));

  const status = enrolledCount >= cls.capacity ? "waitlisted" : "enrolled";
  await db.insert(classEnrollments).values({ classId: input.classId, requestItemId: input.requestItemId, employeeId: item.employeeId, companyId: employee.companyId, status });
  await db.update(requestItems).set({ status: status === "enrolled" ? "enrolled" : "pending" }).where(eq(requestItems.id, input.requestItemId));
  await writeAudit({ userId: context.userId, entityType: "class_enrollment", entityId: input.classId, action: status === "enrolled" ? "enroll" : "waitlist", note: String(item.employeeId) });

  if (status === "enrolled") {
    await notifyEnrolled(input.classId, employee.companyId, cls.trainerId, item.employeeId);
    await maybeMarkRequestScheduled(item.requestId);
  }
  return { status };
}

async function promoteFromWaitlist(classId: number, seatsFreed: number) {
  const cls = await getClassOrThrow(classId);
  for (let i = 0; i < seatsFreed; i++) {
    const [next] = await db
      .select()
      .from(classEnrollments)
      .where(and(eq(classEnrollments.classId, classId), eq(classEnrollments.status, "waitlisted")))
      .orderBy(asc(classEnrollments.createdAt))
      .limit(1);
    if (!next) return;

    await db.update(classEnrollments).set({ status: "enrolled" }).where(eq(classEnrollments.id, next.id));
    await db.update(requestItems).set({ status: "enrolled" }).where(eq(requestItems.id, next.requestItemId));
    await notifyEnrolled(classId, next.companyId, cls.trainerId, next.employeeId);

    const [item] = await db.select({ requestId: requestItems.requestId }).from(requestItems).where(eq(requestItems.id, next.requestItemId));
    if (item) await maybeMarkRequestScheduled(item.requestId);
  }
}

// Roster removal (not a waitlist removal) — frees a seat, so this promotes
// the next waitlisted employee, matching the validated prototype.

// Move an already-enrolled employee to a different class.
//
// An UPDATE of class_id rather than remove-then-enroll: the enrollment id
// stays stable, so request_items.status and anything pointing at the
// enrollment survive the move intact.
//
// The hard rule is that delivery records belong to the class they happened
// in. Once attendance, a result, or a certificate exists, the move is
// refused — moving would either strand those records against a class the
// employee is no longer in, or quietly delete evidence a certificate was
// issued on. Withdraw and re-enroll is the honest path there, and it leaves
// both halves visible.
export async function moveEnrollment(context: AuthContext, input: MoveEnrollmentInput) {
  requireScheduleAccess(context);

  const [enrollment] = await db.select().from(classEnrollments).where(eq(classEnrollments.id, input.enrollmentId));
  if (!enrollment) throw new Error("Enrollment not found.");
  if (enrollment.classId === input.toClassId) return;

  const from = await getClassOrThrow(enrollment.classId);
  const to = await getClassOrThrow(input.toClassId);
  if (to.status === "cancelled" || to.status === "completed") {
    throw new GuardError(`Can't move anyone into a class that's ${to.status}.`);
  }
  if (to.courseId !== from.courseId) {
    throw new GuardError("The other class teaches a different course. Withdraw the employee and enroll them from the scheduling board instead.");
  }

  const [attendanceRow] = await db
    .select({ id: attendance.id })
    .from(attendance)
    .where(and(eq(attendance.classId, enrollment.classId), eq(attendance.employeeId, enrollment.employeeId)))
    .limit(1);
  if (attendanceRow) {
    throw new GuardError("This employee already has attendance recorded on this class. Withdraw them instead, then enroll them in the new class.");
  }

  const [resultRow] = await db.select({ id: examResults.id }).from(examResults).where(eq(examResults.enrollmentId, enrollment.id)).limit(1);
  if (resultRow) {
    throw new GuardError("This employee already has an exam result on this class. Withdraw them instead, then enroll them in the new class.");
  }

  const [certificateRow] = await db
    .select({ id: certificates.id })
    .from(certificates)
    .where(and(eq(certificates.classId, enrollment.classId), eq(certificates.employeeId, enrollment.employeeId)))
    .limit(1);
  if (certificateRow) throw new GuardError("A certificate already exists for this employee on this class.");

  // Refuse a full class rather than silently landing them on its waitlist —
  // a move that quietly becomes a waitlist entry reads as "done" and isn't.
  const [{ value: enrolledCount }] = await db
    .select({ value: count() })
    .from(classEnrollments)
    .where(and(eq(classEnrollments.classId, input.toClassId), eq(classEnrollments.status, "enrolled")));
  if (enrolledCount >= to.capacity) {
    throw new GuardError(`That class is full (${enrolledCount}/${to.capacity}). Raise its capacity first, or pick another.`);
  }

  // class_enrollments has unique (class_id, employee_id).
  const [clash] = await db
    .select({ id: classEnrollments.id })
    .from(classEnrollments)
    .where(and(eq(classEnrollments.classId, input.toClassId), eq(classEnrollments.employeeId, enrollment.employeeId)));
  if (clash) throw new GuardError("This employee is already on that class.");

  await db
    .update(classEnrollments)
    .set({ classId: input.toClassId, status: "enrolled", attendancePct: null, updatedAt: new Date() })
    .where(eq(classEnrollments.id, enrollment.id));

  await writeAudit({
    userId: context.userId,
    entityType: "class_enrollment",
    entityId: enrollment.id,
    action: "move",
    note: `class ${enrollment.classId} -> ${input.toClassId} (employee ${enrollment.employeeId})`,
  });

  await notifyEnrolled(input.toClassId, enrollment.companyId, to.trainerId, enrollment.employeeId);
  // The seat freed on the old class goes to whoever was waiting for it.
  await promoteFromWaitlist(enrollment.classId, 1);
}

export async function removeEnrollment(context: AuthContext, enrollmentId: number) {
  requireScheduleAccess(context);
  const [enrollment] = await db.select().from(classEnrollments).where(eq(classEnrollments.id, enrollmentId));
  if (!enrollment) throw new Error("Enrollment not found.");

  await db.delete(classEnrollments).where(eq(classEnrollments.id, enrollmentId));
  await db.update(requestItems).set({ status: "pending" }).where(eq(requestItems.id, enrollment.requestItemId));
  await writeAudit({ userId: context.userId, entityType: "class_enrollment", entityId: enrollmentId, action: "remove" });

  if (enrollment.status === "enrolled") {
    await promoteFromWaitlist(enrollment.classId, 1);
  }
}

// Waitlist removal — no seat freed, so no promotion.
export async function removeFromWaitlist(context: AuthContext, enrollmentId: number) {
  requireScheduleAccess(context);
  const [enrollment] = await db.select().from(classEnrollments).where(eq(classEnrollments.id, enrollmentId));
  if (!enrollment || enrollment.status !== "waitlisted") throw new Error("Not on the waitlist.");

  await db.delete(classEnrollments).where(eq(classEnrollments.id, enrollmentId));
  await db.update(requestItems).set({ status: "pending" }).where(eq(requestItems.id, enrollment.requestItemId));
}
