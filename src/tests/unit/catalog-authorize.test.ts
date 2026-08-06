import { describe, expect, it } from "vitest";
import type { AuthContext } from "../../modules/platform/auth/shared";
import {
  createCourse,
  createExam,
  createPricing,
  createTrainer,
  createTrainingCenter,
  setCourseJobRoles,
  updateCourse,
} from "../../modules/catalog/service";

// Phase 4.5 acceptance criteria: "platform_admin gets 403/RLS-denied
// attempting any catalog or pricing write". This is the authorize()-layer
// half — every catalog/pricing/trainer-roster mutation checks authorize()
// as its first statement, before touching the database, so platform_admin
// (and contractor_manager/trainer) never even reach a write attempt. The
// RLS half is tests/rls/catalog-pricing-write-denial.test.ts (Phase 2),
// which proves the database itself would deny it too, independently.
const nonSuperAdminContexts: AuthContext[] = [
  { userId: "00000000-0000-0000-0000-000000000001", role: "platform_admin", companyId: null, trainerId: null, region: null, aal: "aal2" },
  { userId: "00000000-0000-0000-0000-000000000002", role: "contractor_manager", companyId: 1, trainerId: null, region: null, aal: "aal2" },
  { userId: "00000000-0000-0000-0000-000000000003", role: "trainer", companyId: null, trainerId: 1, region: null, aal: "aal2" },
];

describe("catalog service — non-super_admin roles denied at authorize(), before any DB write", () => {
  for (const context of nonSuperAdminContexts) {
    it(`${context.role} cannot createCourse`, async () => {
      await expect(
        createCourse(context, { code: "X", titleEn: "x", titleAr: "x", durationHours: 1, minAttendancePct: 90 })
      ).rejects.toThrow("Not authorized");
    });

    it(`${context.role} cannot updateCourse`, async () => {
      await expect(
        updateCourse(context, { courseId: 1, code: "X", titleEn: "x", titleAr: "x", durationHours: 1, minAttendancePct: 90, active: true })
      ).rejects.toThrow("Not authorized");
    });

    it(`${context.role} cannot setCourseJobRoles`, async () => {
      await expect(setCourseJobRoles(context, { courseId: 1, jobRoleIds: [1] })).rejects.toThrow("Not authorized");
    });

    it(`${context.role} cannot createExam`, async () => {
      await expect(createExam(context, { code: "X", title: "x", passMark: 70 })).rejects.toThrow("Not authorized");
    });

    it(`${context.role} cannot createTrainingCenter`, async () => {
      await expect(createTrainingCenter(context, { name: "x" })).rejects.toThrow("Not authorized");
    });

    it(`${context.role} cannot createPricing`, async () => {
      await expect(createPricing(context, { courseId: 1, price: 500, effectiveFrom: "2026-01-01" })).rejects.toThrow("Not authorized");
    });

    it(`${context.role} cannot createTrainer`, async () => {
      await expect(createTrainer(context, { email: "x@example.com", fullName: "x" })).rejects.toThrow("Not authorized");
    });
  }
});
