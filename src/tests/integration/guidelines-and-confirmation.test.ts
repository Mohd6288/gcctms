import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import {
  classEnrollments,
  classes,
  companies,
  courses,
  employees,
  jobRoles,
  jobs,
  manufacturers,
  profiles,
  requestItems,
  trainers,
  trainingRequests,
} from "../../db/schema";
import { confirmManufacturerScheduling, sendTestGuidelines } from "../../modules/cards/service";
import { GuardError } from "../../modules/platform/guard-error";
import { encryptNationalId, hashNationalId } from "../../modules/platform/security/national-id";
import type { AuthContext } from "../../modules/platform/auth/shared";

// Steps 5 and 6. Until the manufacturer agrees the date it is GCC Lab's
// proposal, and the guidelines are what tells a technician to travel to it —
// so the order between them is the point, not an incidental sequencing.
describe("manufacturer confirmation and the guidelines", () => {
  const suffix = randomUUID().slice(0, 8);
  const adminId = randomUUID();
  const adminCtx: AuthContext = { userId: adminId, role: "platform_admin", companyId: null, trainerId: null, region: null, aal: "aal2" };

  let companyId: number;
  let classId: number;
  let manufacturerId: number;
  let requestId: number;
  let employeeId: number;

  beforeAll(async () => {
    await db.execute(sql`insert into auth.users (id, email) values (${adminId}, ${`guide-${suffix}@example.test`})`);
    await db.insert(profiles).values({ userId: adminId, role: "platform_admin", fullName: "Guidelines Admin" });

    const [company] = await db
      .insert(companies)
      .values({
        name: `Guide Co ${suffix}`,
        crNumber: `CR-GD-${suffix}`,
        contactName: "Contact",
        contactEmail: `gd-${suffix}@example.test`,
        contactPhone: "0500000007",
        contractorCategory: "Distribution",
        ownerUserId: adminId,
      })
      .returning({ id: companies.id });
    companyId = company.id;

    const [maker] = await db
      .insert(manufacturers)
      .values({ name: `Guide Maker ${suffix}`, contactEmail: `gm-${suffix}@example.test` })
      .returning({ id: manufacturers.id });
    manufacturerId = maker.id;

    const [course] = await db.select({ id: courses.id }).from(courses).where(eq(courses.code, "CTCT10"));
    const [trainer] = await db
      .insert(trainers)
      .values({ fullName: `Guide Evaluator ${suffix}`, email: `ge-${suffix}@example.test` })
      .returning({ id: trainers.id });
    const [cls] = await db
      .insert(classes)
      .values({
        courseId: course.id,
        trainerId: trainer.id,
        region: "Central",
        type: "public",
        startDate: "2026-09-01",
        endDate: "2026-09-01",
        sessions: [],
        capacity: 10,
        locationNote: "Cable workshop – GCCLAB",
        status: "scheduled",
      })
      .returning({ id: classes.id });
    classId = cls.id;

    const [role] = await db.select({ id: jobRoles.id }).from(jobRoles).where(eq(jobRoles.code, "D07"));
    const nid = `2${Math.floor(Math.random() * 1e9)}`.padEnd(10, "0");
    const [employee] = await db
      .insert(employees)
      .values({
        companyId,
        fullNameEn: "Guided Technician",
        fullNameAr: "فني",
        nationalIdEnc: encryptNationalId(nid),
        nationalIdHash: hashNationalId(nid),
        jobRoleId: role.id,
        status: "active",
      })
      .returning({ id: employees.id });
    employeeId = employee.id;

    const [request] = await db
      .insert(trainingRequests)
      .values({ companyId, requestedBy: adminId, courseId: course.id, status: "scheduled" })
      .returning({ id: trainingRequests.id });
    requestId = request.id;
    const [item] = await db
      .insert(requestItems)
      .values({ requestId, employeeId, courseId: course.id })
      .returning({ id: requestItems.id });
    await db
      .insert(classEnrollments)
      .values({ classId, requestItemId: item.id, employeeId, companyId, status: "enrolled" });
  });

  afterAll(async () => {
    await db.delete(jobs).where(sql`payload->>'recipientEmail' = ${`gd-${suffix}@example.test`}`);
    await db.delete(classEnrollments).where(eq(classEnrollments.classId, classId));
    await db.delete(requestItems).where(eq(requestItems.requestId, requestId));
    await db.delete(trainingRequests).where(eq(trainingRequests.id, requestId));
    await db.delete(classes).where(eq(classes.id, classId));
    await db.delete(employees).where(eq(employees.id, employeeId));
    await db.delete(companies).where(eq(companies.id, companyId));
    await db.delete(manufacturers).where(eq(manufacturers.id, manufacturerId));
    await db.delete(profiles).where(eq(profiles.userId, adminId));
    await db.execute(sql`delete from auth.users where id = ${adminId}`);
  });

  it("refuses to send guidelines before the manufacturer has agreed the date", async () => {
    // The failure this prevents is a wasted test day: candidates travelling to
    // a date nobody outside GCC Lab has agreed to.
    await expect(sendTestGuidelines(adminCtx, classId)).rejects.toThrow(/not confirmed|proposal/i);
  });

  it("records the confirmation against the class", async () => {
    await confirmManufacturerScheduling(adminCtx, { classId, manufacturerId, confirmed: true });
    const [cls] = await db.select().from(classes).where(eq(classes.id, classId));
    expect(cls.manufacturerId).toBe(manufacturerId);
    expect(cls.manufacturerConfirmedAt).not.toBeNull();
  });

  it("can un-confirm, so a misclick does not need a database edit", async () => {
    await confirmManufacturerScheduling(adminCtx, { classId, manufacturerId, confirmed: false });
    const [cls] = await db.select().from(classes).where(eq(classes.id, classId));
    expect(cls.manufacturerConfirmedAt).toBeNull();
    await expect(sendTestGuidelines(adminCtx, classId)).rejects.toBeInstanceOf(GuardError);

    await confirmManufacturerScheduling(adminCtx, { classId, manufacturerId, confirmed: true });
  });

  it("sends one message per contractor, not one per technician", async () => {
    // The contractor coordinates attendance, arranges the entry permit and
    // brings the materials. Emailing each candidate would send instructions to
    // people who cannot act on most of them.
    const result = await sendTestGuidelines(adminCtx, classId);
    expect(result.sentTo).toBe(1);

    const queued = await db
      .select()
      .from(jobs)
      .where(sql`payload->>'recipientEmail' = ${`gd-${suffix}@example.test`}`);
    expect(queued).toHaveLength(1);

    const [cls] = await db.select().from(classes).where(eq(classes.id, classId));
    expect(cls.guidelinesSentAt).not.toBeNull();
  });

  it("refuses to send them twice", async () => {
    // A second copy of a date that has not changed only invites doubt about
    // which one is right.
    await expect(sendTestGuidelines(adminCtx, classId)).rejects.toThrow(/already been sent/i);
  });
});
