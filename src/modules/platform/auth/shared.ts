// Pure role/capability logic with no server-only dependency — safe to import
// from both server code (service.ts re-exports these) and Client Components
// (the sign-in/MFA forms need roleHomePath/mfaRequiredFor client-side).

export const ROLES = ["super_admin", "platform_admin", "contractor_manager", "trainer"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function roleHomePath(role: Role): string {
  switch (role) {
    case "super_admin":
      return "/superadmin";
    case "platform_admin":
      return "/admin";
    case "trainer":
      return "/trainer";
    case "contractor_manager":
      return "/dashboard";
  }
}

// MFA (TOTP) is enforced for every role except contractor_manager — see
// security-and-hosting.md ("MFA enforced for platform_admin and trainer")
// and roles-and-workflows.md (super_admin carries the same operational
// weight as platform_admin, so it's held to the same bar).
export function mfaRequiredFor(role: Role): boolean {
  return role !== "contractor_manager";
}

// Role -> capability map, mirroring roles-and-workflows.md's permission
// matrix exactly. A coarse allow/deny gate — "own" vs "all" scoping (e.g. a
// contractor_manager only touching their own company) is enforced by the
// caller's query scoping + RLS, not here. Every Server Action/Route Handler
// calls authorize(capability, context) before touching data (RLS is the
// backstop, not the only layer — see Golden Rule 2).
export const CAPABILITY_ROLES = {
  manage_users: ["super_admin"],
  manage_companies: ["super_admin", "platform_admin", "contractor_manager"],
  manage_employees: ["super_admin", "platform_admin", "contractor_manager"],
  upload_documents: ["super_admin", "platform_admin", "contractor_manager"],
  submit_requests: ["contractor_manager"],
  review_requests: ["platform_admin"],
  manage_pricing: ["super_admin"],
  view_pricing: ["super_admin", "platform_admin"],
  upload_payment: ["contractor_manager"],
  verify_payments: ["platform_admin"],
  manage_catalog: ["super_admin"],
  manage_trainer_roster: ["super_admin"],
  schedule_classes: ["platform_admin"],
  record_attendance: ["platform_admin", "trainer"],
  record_results: ["platform_admin", "trainer"],
  approve_certificates: ["platform_admin"],
  view_certificates: ["super_admin", "platform_admin", "contractor_manager", "trainer"],
  view_reports: ["super_admin", "platform_admin", "contractor_manager", "trainer"],
  view_audit_log: ["super_admin", "platform_admin"],
} as const satisfies Record<string, readonly Role[]>;

export type Capability = keyof typeof CAPABILITY_ROLES;

export interface AuthContext {
  userId: string;
  role: Role;
  companyId: number | null;
  trainerId: number | null;
  /** Authenticator Assurance Level — "aal2" means an MFA challenge was completed this session. */
  aal: "aal1" | "aal2";
}

export function authorize(capability: Capability, context: AuthContext | null): boolean {
  if (!context) return false;
  return (CAPABILITY_ROLES[capability] as readonly Role[]).includes(context.role);
}
