// employees module — business logic (Server Actions call into here, never touch db/ directly for RLS-scoped ops).
import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { companies, employees, jobRoles } from "@/db/schema";
import { authorize, type AuthContext } from "@/modules/platform/auth/shared";
import { writeAudit } from "@/modules/platform/audit/service";
import { encryptNationalId, hashNationalId } from "@/modules/platform/security/national-id";
import type { CreateEmployeeInput, ImportEmployeeRow, UpdateEmployeeInput } from "./schema";

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
        nationality: input.nationality || null,
        activity: input.activity || null,
        contractorArea: input.contractorArea || null,
        contractorCity: input.contractorCity || null,
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
      nationality: input.nationality || null,
      activity: input.activity || null,
      contractorArea: input.contractorArea || null,
      contractorCity: input.contractorCity || null,
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

// Bulk-creates employees parsed from an uploaded Registration Sheet or HRBL
// request form. jobTitleText is free text from the sheet — resolved against
// the company's real job roles by exact, case-insensitive match, scoped to
// its contractor_category like listActiveJobRoles (unscoped if the company
// has none set). A row that can't be resolved, fails Iqama validation, or
// collides with an existing/already-imported-in-this-batch Iqama is skipped
// with a reason rather than failing the whole import — matches the
// validated prototype's per-row skip-count UI. English/Arabic name aren't
// distinguished in the source sheet (one "Name" column) — both fields get
// the same raw value; the contractor can split them via Edit Employee.
export async function importEmployees(context: AuthContext, companyId: number, rows: ImportEmployeeRow[]) {
  if (!authorize("manage_employees", context)) throw new Error("Not authorized");
  assertCanTouchCompany(context, companyId);

  const [company] = await db.select({ contractorCategory: companies.contractorCategory }).from(companies).where(eq(companies.id, companyId));
  const category = company?.contractorCategory ?? null;
  const roleRows = await db
    .select({ id: jobRoles.id, nameEn: jobRoles.nameEn })
    .from(jobRoles)
    .where(category ? and(eq(jobRoles.active, true), eq(jobRoles.contractorCategory, category)) : eq(jobRoles.active, true));
  const roleIdByLowerName = new Map(roleRows.map((r) => [r.nameEn.toLowerCase(), r.id]));

  const created: { id: number; fullName: string }[] = [];
  const skipped: { row: number; reason: string }[] = [];
  const seenIqamaThisBatch = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!/^\d{10}$/.test(row.nationalId)) {
      skipped.push({ row: i + 1, reason: "Invalid Iqama number" });
      continue;
    }
    if (seenIqamaThisBatch.has(row.nationalId)) {
      skipped.push({ row: i + 1, reason: "Duplicate Iqama number in this file" });
      continue;
    }
    const jobRoleId = row.jobTitleText ? roleIdByLowerName.get(row.jobTitleText.trim().toLowerCase()) : undefined;
    if (!jobRoleId) {
      skipped.push({ row: i + 1, reason: "Could not match job title — add manually via Edit Employee" });
      continue;
    }

    try {
      const [employee] = await db
        .insert(employees)
        .values({
          companyId,
          fullNameEn: row.fullName,
          fullNameAr: row.fullName,
          nationalIdEnc: encryptNationalId(row.nationalId),
          nationalIdHash: hashNationalId(row.nationalId),
          jobRoleId,
          email: row.email || null,
          phone: row.phone || null,
          nationality: row.nationality || null,
          activity: row.activity || null,
          contractorArea: row.contractorArea || null,
          contractorCity: row.contractorCity || null,
        })
        .returning({ id: employees.id });
      seenIqamaThisBatch.add(row.nationalId);
      created.push({ id: employee.id, fullName: row.fullName });
      await writeAudit({ userId: context.userId, entityType: "employee", entityId: employee.id, action: "create" });
    } catch (err) {
      const pgCode = (err as { cause?: { code?: string } })?.cause?.code;
      skipped.push({ row: i + 1, reason: pgCode === "23505" ? "This Iqama is already registered" : "Could not save this row" });
    }
  }

  return { created, skipped };
}
