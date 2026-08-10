// Pure role/capability logic with no server-only dependency — safe to import
// from both server code (service.ts re-exports these) and Client Components
// (the sign-in/MFA forms need roleHomePath/mfaRequiredFor client-side).

export const ROLES = ["super_admin", "platform_admin", "contractor_manager", "trainer", "auditor"] as const;
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
    case "auditor":
      return "/auditor";
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

// DEV-ONLY escape hatch: a fixed, named allowlist of test account emails
// that skip MFA entirely (no enroll/challenge redirect, no aal2 gate) —
// requireRole()'s own MFA check calls this too, so it's a real bypass, not
// just a UI skip. Controlled by NEXT_PUBLIC_MFA_BYPASS_EMAILS (comma-
// separated), which must NEVER be set in a real production environment —
// see docs/runbook.md. NEXT_PUBLIC_ because sign-in-form.tsx needs this
// before a session/role is even known (the user just typed the email).
export function isMfaBypassEmail(email: string): boolean {
  const list = process.env.NEXT_PUBLIC_MFA_BYPASS_EMAILS ?? "";
  return list
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
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
  view_certificates: ["super_admin", "platform_admin", "contractor_manager", "trainer", "auditor"],
  view_reports: ["super_admin", "platform_admin", "contractor_manager", "trainer", "auditor"],
  view_audit_log: ["super_admin", "platform_admin", "auditor"],
  // Read-only, platform-wide oversight. Deliberately its own capability
  // rather than adding auditor to review_requests or manage_*: an auditor
  // must never reach a mutation path, and reusing an existing capability
  // would grant one the moment somebody adds an action behind it.
  view_audit_portal: ["auditor"],
} as const satisfies Record<string, readonly Role[]>;

export type Capability = keyof typeof CAPABILITY_ROLES;

export interface AuthContext {
  userId: string;
  role: Role;
  companyId: number | null;
  trainerId: number | null;
  /**
   * Set only for a platform_admin assigned to a region via
   * regional_admin_assignments (Phase 5). null means unassigned, which is
   * NOT "no access" — it means unrestricted (sees every region), matching
   * today's default so existing/new admin accounts aren't silently locked
   * out until someone explicitly assigns them one.
   */
  region: string | null;
  /** Authenticator Assurance Level — "aal2" means an MFA challenge was completed this session. */
  aal: "aal1" | "aal2";
}

export function authorize(capability: Capability, context: AuthContext | null): boolean {
  if (!context) return false;
  return (CAPABILITY_ROLES[capability] as readonly Role[]).includes(context.role);
}
