// employees module — business logic (Server Actions call into here, never touch db/ directly for RLS-scoped ops).
import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { employees } from "@/db/schema";
import { authorize, type AuthContext } from "@/modules/platform/auth/shared";
import { writeAudit } from "@/modules/platform/audit/service";
import { encryptNationalId, hashNationalId } from "@/modules/platform/security/national-id";
import type { CreateEmployeeInput, UpdateEmployeeInput } from "./schema";

// Mirrors employees' actual RLS policies exactly (0006_employees.sql):
// platform_admin has a blanket policy, contractor_manager is scoped to its
// own company_id, and there is NO super_admin policy on this table (per
// roles-and-workflows.md, super_admin's blanket access stays scoped to
// catalog/pricing). authorize("manage_employees", context) alone is too
// coarse — the permission matrix lists super_admin ✓ for manage_employees,
// but that's not this table's real RLS scope, so this check must be
// stricter than authorize() to avoid the app granting more than RLS would.
function assertCanTouchCompany(context: AuthContext, companyId: number) {
  if (context.role === "platform_admin") return;
  if (context.role === "contractor_manager" && context.companyId === companyId) return;
  throw new Error("Not authorized");
}

// Global Iqama uniqueness is enforced by the database (employees_national_id_hash_key,
// see 0006_employees.sql) — this just turns the resulting 23505 into a
// message that doesn't leak which company the existing record belongs to.
function rethrowFriendlyDuplicateError(err: unknown): never {
  const pgCode = (err as { cause?: { code?: string } })?.cause?.code;
  if (pgCode === "23505") {
    throw new Error("This national ID is already registered in the system.");
  }
  throw err as Error;
}

export async function createEmployee(context: AuthContext, input: CreateEmployeeInput) {
  if (!authorize("manage_employees", context)) throw new Error("Not authorized");
  assertCanTouchCompany(context, input.companyId);

  try {
    const [employee] = await db
      .insert(employees)
      .values({
        companyId: input.companyId,
        fullNameEn: input.fullNameEn,
        fullNameAr: input.fullNameAr,
        nationalIdEnc: encryptNationalId(input.nationalId),
        nationalIdHash: hashNationalId(input.nationalId),
        jobRoleId: input.jobRoleId,
        email: input.email || null,
        phone: input.phone || null,
      })
      .returning({ id: employees.id });

    await writeAudit({
      userId: context.userId,
      entityType: "employee",
      entityId: employee.id,
      action: "create",
    });

    return employee;
  } catch (err) {
    rethrowFriendlyDuplicateError(err);
  }
}

export async function updateEmployee(context: AuthContext, input: UpdateEmployeeInput) {
  if (!authorize("manage_employees", context)) throw new Error("Not authorized");

  const [existing] = await db.select({ companyId: employees.companyId }).from(employees).where(eq(employees.id, input.employeeId));
  if (!existing) throw new Error("Employee not found");
  assertCanTouchCompany(context, existing.companyId);

  await db
    .update(employees)
    .set({
      fullNameEn: input.fullNameEn,
      fullNameAr: input.fullNameAr,
      jobRoleId: input.jobRoleId,
      email: input.email || null,
      phone: input.phone || null,
      status: input.status,
    })
    .where(eq(employees.id, input.employeeId));

  await writeAudit({
    userId: context.userId,
    entityType: "employee",
    entityId: input.employeeId,
    action: "update",
  });
}
