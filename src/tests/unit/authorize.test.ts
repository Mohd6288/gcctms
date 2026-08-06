import { describe, expect, it } from "vitest";
import { authorize, type AuthContext, type Capability, type Role } from "../../modules/platform/auth/shared";

// Transcribed directly from roles-and-workflows.md's permission matrix table
// (independently of CAPABILITY_ROLES in shared.ts) so this test catches a
// transcription error in either direction, not just self-consistency.
const EXPECTED: Record<Capability, Record<Role, boolean>> = {
  manage_users: { super_admin: true, platform_admin: false, contractor_manager: false, trainer: false },
  manage_companies: { super_admin: true, platform_admin: true, contractor_manager: true, trainer: false },
  manage_employees: { super_admin: true, platform_admin: true, contractor_manager: true, trainer: false },
  upload_documents: { super_admin: true, platform_admin: true, contractor_manager: true, trainer: false },
  submit_requests: { super_admin: false, platform_admin: false, contractor_manager: true, trainer: false },
  review_requests: { super_admin: false, platform_admin: true, contractor_manager: false, trainer: false },
  manage_pricing: { super_admin: true, platform_admin: false, contractor_manager: false, trainer: false },
  view_pricing: { super_admin: true, platform_admin: true, contractor_manager: false, trainer: false },
  upload_payment: { super_admin: false, platform_admin: false, contractor_manager: true, trainer: false },
  verify_payments: { super_admin: false, platform_admin: true, contractor_manager: false, trainer: false },
  manage_catalog: { super_admin: true, platform_admin: false, contractor_manager: false, trainer: false },
  manage_trainer_roster: { super_admin: true, platform_admin: false, contractor_manager: false, trainer: false },
  schedule_classes: { super_admin: false, platform_admin: true, contractor_manager: false, trainer: false },
  record_attendance: { super_admin: false, platform_admin: true, contractor_manager: false, trainer: true },
  record_results: { super_admin: false, platform_admin: true, contractor_manager: false, trainer: true },
  approve_certificates: { super_admin: false, platform_admin: true, contractor_manager: false, trainer: false },
  view_certificates: { super_admin: true, platform_admin: true, contractor_manager: true, trainer: true },
  view_reports: { super_admin: true, platform_admin: true, contractor_manager: true, trainer: true },
  view_audit_log: { super_admin: true, platform_admin: true, contractor_manager: false, trainer: false },
};

const ROLES: Role[] = ["super_admin", "platform_admin", "contractor_manager", "trainer"];

function contextFor(role: Role): AuthContext {
  return { userId: "00000000-0000-0000-0000-000000000000", role, companyId: null, trainerId: null, region: null, aal: "aal2" };
}

describe("authorize() — full 4-role x 19-capability matrix", () => {
  for (const capability of Object.keys(EXPECTED) as Capability[]) {
    for (const role of ROLES) {
      const expected = EXPECTED[capability][role];
      it(`${capability} / ${role} -> ${expected}`, () => {
        expect(authorize(capability, contextFor(role))).toBe(expected);
      });
    }
  }

  it("denies everything when context is null (unauthenticated)", () => {
    for (const capability of Object.keys(EXPECTED) as Capability[]) {
      expect(authorize(capability, null)).toBe(false);
    }
  });

  it("covers every capability named in roles-and-workflows.md's matrix (no drift)", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([
      "approve_certificates",
      "manage_catalog",
      "manage_companies",
      "manage_employees",
      "manage_pricing",
      "manage_trainer_roster",
      "manage_users",
      "record_attendance",
      "record_results",
      "review_requests",
      "schedule_classes",
      "submit_requests",
      "upload_documents",
      "upload_payment",
      "verify_payments",
      "view_audit_log",
      "view_certificates",
      "view_pricing",
      "view_reports",
    ]);
  });
});
