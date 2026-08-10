import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import {
  auditLog,
  classEnrollments,
  classes,
  companies,
  courses,
  employees,
  jobRoles,
  requestItems,
  trainerCourses,
  trainers,
  trainingRequests,
} from "../../db/schema";
import { encryptNationalId, hashNationalId } from "../../modules/platform/security/national-id";
import type { AuthContext } from "../../modules/platform/auth/shared";
import {
  cancelClass,
  createClass,
  enrollRequestItem,
  removeEnrollment,
  removeFromWaitlist,
  updateClass,
} from "../../modules/scheduling/service";

// Phase 6 — real DB, since the headline guarantee (trainer double-booking)
// is enforced by classes_trainer_no_overlap, a GIST exclusion constraint —
// a mock/synthetic DB can't prove that at all.
describe("scheduling — classes, capacity/waitlist, cancellation, real DB", () => {
  const suffix = randomUUID().slice(0, 8);
  const ownerId = randomUUID();
  const adminId = randomUUID();
  const trainerUserId = randomUUID();
  let companyId: number;
  let jobRoleId: number;
  let courseId: number;
  let trainerId: number;

  let adminCtx: AuthContext;

  async function makeRequestItem(seq: number, decision: "pending" | "approved" | "rejected" = "approved") {
    const [employee] = await db
      .insert(employees)
      .values({
        companyId,
        fullNameEn: `Sched Employee ${seq}`,
        fullNameAr: `موظف ${seq}`,
        nationalIdEnc: encryptNationalId(`2322${String(seq).padStart(6, "0")}`),
        nationalIdHash: hashNationalId(`2322${String(seq).padStart(6, "0")}`),
        jobRoleId,
      })
      .returning({ id: employees.id });

    const [request] = await db
      .insert(trainingRequests)
      .values({
        companyId,
        requestedBy: ownerId,
        courseId,
        status: "ready_for_scheduling",
        preferredRegion: "Central",
      })
      .returning({ id: trainingRequests.id });

    const [item] = await db
      .insert(requestItems)
      .values({ requestId: request.id, employeeId: employee.id, courseId, decision })
      .returning({ id: requestItems.id });

    return { requestId: request.id, requestItemId: item.id, employeeId: employee.id };
  }

  beforeAll(async () => {
    await db.execute(sql`insert into auth.users (id) values (${ownerId}), (${adminId}), (${trainerUserId})`);
    await db.execute(sql`insert into profiles (user_id, role, full_name) values (${adminId}, 'platform_admin', 'Sched Admin')`);

    const [company] = await db
      .insert(companies)
      .values({
        name: "Scheduling Test Contractor",
        crNumber: `CR-SCHED-${suffix}`,
        contactName: "Contact",
        contactEmail: `sched-${suffix}@example.com`,
        contactPhone: "0500000001",
        ownerUserId: ownerId,
      })
      .returning({ id: companies.id });
    companyId = company.id;

    const [jobRole] = await db.insert(jobRoles).values({ code: `SCHED-ROLE-${suffix}`, nameEn: "Sched Role", nameAr: "دور" }).returning({ id: jobRoles.id });
    jobRoleId = jobRole.id;

    const [course] = await db.insert(courses).values({ code: `SCHED-${suffix}`, titleEn: "Scheduling Test Course", titleAr: "دورة", durationHours: "8" }).returning({ id: courses.id });
    courseId = course.id;

    const [trainer] = await db.insert(trainers).values({ userId: trainerUserId, fullName: "Sched Trainer" }).returning({ id: trainers.id });
    trainerId = trainer.id;

    adminCtx = { userId: adminId, role: "platform_admin", companyId: null, trainerId: null, region: null, aal: "aal2" };
  });

  afterAll(async () => {
    await db.delete(classEnrollments).where(sql`company_id = ${companyId}`);
    await db.delete(requestItems).where(sql`request_id in (select id from ${trainingRequests} where company_id = ${companyId})`);
    await db.delete(trainingRequests).where(eq(trainingRequests.companyId, companyId));
    await db.delete(classes).where(eq(classes.trainerId, trainerId));
    await db.delete(trainerCourses).where(eq(trainerCourses.trainerId, trainerId));
    await db.delete(employees).where(eq(employees.companyId, companyId));
    await db.delete(trainers).where(eq(trainers.id, trainerId));
    await db.delete(courses).where(eq(courses.id, courseId));
    await db.delete(jobRoles).where(eq(jobRoles.id, jobRoleId));
    await db.delete(companies).where(eq(companies.id, companyId));
    await db.execute(sql`delete from profiles where user_id = ${adminId}`);
    await db.execute(sql`delete from auth.users where id in (${ownerId}, ${adminId}, ${trainerUserId})`);
  });

  // The admin screen filters the trainer dropdown to the certified ones and
  // makes reaching past it an explicit tick-box, because GCC Lab sometimes
  // has to run a class without a certified instructor. The server does not
  // block it — it records it, so the override is answerable later.
  it("notes an uncertified trainer on the class audit row, and stays silent for a certified one", async () => {
    const uncertified = await createClass(adminCtx, {
      courseId,
      trainerId,
      region: "Central",
      type: "public",
      startDate: "2031-03-01",
      endDate: "2031-03-03",
      capacity: 5,
    });
    const [noted] = await db
      .select({ note: auditLog.note })
      .from(auditLog)
      .where(sql`entity_type = 'class' and entity_id = ${uncertified.id} and action = 'create'`);
    expect(noted.note).toBe("Trainer is not certified for this course (override)");

    await db.insert(trainerCourses).values({ trainerId, courseId });
    const certified = await createClass(adminCtx, {
      courseId,
      trainerId,
      region: "Central",
      type: "public",
      startDate: "2031-04-01",
      endDate: "2031-04-03",
      capacity: 5,
    });
    const [clean] = await db
      .select({ note: auditLog.note })
      .from(auditLog)
      .where(sql`entity_type = 'class' and entity_id = ${certified.id} and action = 'create'`);
    expect(clean.note).toBeNull();

    await db.delete(trainerCourses).where(eq(trainerCourses.trainerId, trainerId));
  });

  it("blocks creating a class that double-books the trainer with an overlapping date range", async () => {
    const first = await createClass(adminCtx, {
      courseId,
      trainerId,
      region: "Central",
      type: "public",
      startDate: "2030-01-10",
      endDate: "2030-01-12",
      capacity: 5,
    });
    expect(first.id).toBeTypeOf("number");

    await expect(
      createClass(adminCtx, {
        courseId,
        trainerId,
        region: "Central",
        type: "public",
        startDate: "2030-01-11", // overlaps the first class
        endDate: "2030-01-13",
        capacity: 5,
      })
    ).rejects.toThrow("This trainer already has another class scheduled with overlapping dates.");

    // A non-overlapping class for the same trainer is fine.
    const nonOverlapping = await createClass(adminCtx, {
      courseId,
      trainerId,
      region: "Central",
      type: "public",
      startDate: "2030-02-01",
      endDate: "2030-02-02",
      capacity: 5,
    });
    expect(nonOverlapping.id).toBeTypeOf("number");

    await db.delete(classes).where(eq(classes.id, nonOverlapping.id));
  });

  it("over-capacity enrollment waitlists instead of rejecting, and cancellation reverts the request + clears enrollments", async () => {
    const cls = await createClass(adminCtx, {
      courseId,
      trainerId,
      region: "Central",
      type: "public",
      startDate: "2030-03-01",
      endDate: "2030-03-02",
      capacity: 1,
    });

    const a = await makeRequestItem(1);
    const b = await makeRequestItem(2);

    const resultA = await enrollRequestItem(adminCtx, { requestItemId: a.requestItemId, classId: cls.id });
    expect(resultA?.status).toBe("enrolled");
    const resultB = await enrollRequestItem(adminCtx, { requestItemId: b.requestItemId, classId: cls.id });
    expect(resultB?.status).toBe("waitlisted");

    const [reqAAfter] = await db.select({ status: trainingRequests.status }).from(trainingRequests).where(eq(trainingRequests.id, a.requestId));
    expect(reqAAfter.status).toBe("scheduled"); // single-employee request, fully seated -> derived scheduled
    const [reqBAfter] = await db.select({ status: trainingRequests.status }).from(trainingRequests).where(eq(trainingRequests.id, b.requestId));
    expect(reqBAfter.status).toBe("ready_for_scheduling"); // still waitlisted, not derived yet

    await cancelClass(adminCtx, { classId: cls.id, reason: "Trainer unavailable" });

    const [clsAfter] = await db.select({ status: classes.status, cancelReason: classes.cancelReason }).from(classes).where(eq(classes.id, cls.id));
    expect(clsAfter.status).toBe("cancelled");
    expect(clsAfter.cancelReason).toBe("Trainer unavailable");

    const enrollmentsAfter = await db.select().from(classEnrollments).where(eq(classEnrollments.classId, cls.id));
    expect(enrollmentsAfter).toHaveLength(0); // cleared entirely, not soft-withdrawn

    const [reqAAfterCancel] = await db.select({ status: trainingRequests.status }).from(trainingRequests).where(eq(trainingRequests.id, a.requestId));
    expect(reqAAfterCancel.status).toBe("ready_for_scheduling"); // reverted from scheduled
  });

  it("waitlist promotion: removing an enrolled employee promotes the next waitlisted one (FIFO)", async () => {
    const cls = await createClass(adminCtx, {
      courseId,
      trainerId,
      region: "East",
      type: "public",
      startDate: "2030-04-01",
      endDate: "2030-04-02",
      capacity: 1,
    });

    const a = await makeRequestItem(3);
    const b = await makeRequestItem(4);

    await enrollRequestItem(adminCtx, { requestItemId: a.requestItemId, classId: cls.id });
    await enrollRequestItem(adminCtx, { requestItemId: b.requestItemId, classId: cls.id });

    const [enrollmentA] = await db
      .select()
      .from(classEnrollments)
      .where(and(eq(classEnrollments.classId, cls.id), eq(classEnrollments.employeeId, a.employeeId)));

    await removeEnrollment(adminCtx, enrollmentA.id);

    const [enrollmentBAfter] = await db
      .select({ status: classEnrollments.status })
      .from(classEnrollments)
      .where(and(eq(classEnrollments.classId, cls.id), eq(classEnrollments.employeeId, b.employeeId)));
    expect(enrollmentBAfter.status).toBe("enrolled"); // promoted off the waitlist

    const [reqBAfter] = await db.select({ status: trainingRequests.status }).from(trainingRequests).where(eq(trainingRequests.id, b.requestId));
    expect(reqBAfter.status).toBe("scheduled");
  });

  it("removing from the waitlist does not promote anyone (no seat freed)", async () => {
    const cls = await createClass(adminCtx, {
      courseId,
      trainerId,
      region: "West",
      type: "public",
      startDate: "2030-05-01",
      endDate: "2030-05-02",
      capacity: 1,
    });

    const a = await makeRequestItem(5);
    const b = await makeRequestItem(6);
    await enrollRequestItem(adminCtx, { requestItemId: a.requestItemId, classId: cls.id });
    await enrollRequestItem(adminCtx, { requestItemId: b.requestItemId, classId: cls.id });

    const [enrollmentB] = await db
      .select()
      .from(classEnrollments)
      .where(and(eq(classEnrollments.classId, cls.id), eq(classEnrollments.employeeId, b.employeeId)));
    expect(enrollmentB.status).toBe("waitlisted");

    await removeFromWaitlist(adminCtx, enrollmentB.id);

    const remaining = await db.select().from(classEnrollments).where(eq(classEnrollments.classId, cls.id));
    expect(remaining).toHaveLength(1);
    expect(remaining[0].employeeId).toBe(a.employeeId);
    expect(remaining[0].status).toBe("enrolled"); // untouched
  });

  it("updateClass rejects lowering capacity below the current enrolled count", async () => {
    const cls = await createClass(adminCtx, {
      courseId,
      trainerId,
      region: "South",
      type: "public",
      startDate: "2030-06-01",
      endDate: "2030-06-02",
      capacity: 2,
    });
    const a = await makeRequestItem(7);
    await enrollRequestItem(adminCtx, { requestItemId: a.requestItemId, classId: cls.id });

    await expect(
      updateClass(adminCtx, { classId: cls.id, trainerId, startDate: "2030-06-01", endDate: "2030-06-02", capacity: 0 })
    ).rejects.toThrow("Capacity can't be less than the 1 employees already enrolled.");
  });
});
