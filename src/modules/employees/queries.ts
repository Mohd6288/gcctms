// employees module — read-side queries (Drizzle, RLS-scoped via lib/supabase/server.ts).
import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { companies, employees, jobRoles } from "@/db/schema";

export async function listActiveJobRoles() {
  return db
    .select({ id: jobRoles.id, nameEn: jobRoles.nameEn, nameAr: jobRoles.nameAr })
    .from(jobRoles)
    .where(eq(jobRoles.active, true))
    .orderBy(asc(jobRoles.nameEn));
}

export async function getEmployeeById(employeeId: number) {
  const [employee] = await db
    .select({
      id: employees.id,
      companyId: employees.companyId,
      fullNameEn: employees.fullNameEn,
      fullNameAr: employees.fullNameAr,
      email: employees.email,
      phone: employees.phone,
      status: employees.status,
      jobRoleId: employees.jobRoleId,
    })
    .from(employees)
    .where(eq(employees.id, employeeId));
  if (!employee) return null;
  // The employees_status_check CHECK constraint guarantees this narrower
  // union at the database level; Drizzle's column type only knows "text".
  return { ...employee, status: employee.status as "active" | "inactive" };
}

// Contractor's own roster. Caller must have already checked
// authorize("manage_employees", context) and that companyId === context.companyId.
export async function listEmployeesForCompany(companyId: number) {
  return db
    .select({
      id: employees.id,
      fullNameEn: employees.fullNameEn,
      fullNameAr: employees.fullNameAr,
      email: employees.email,
      phone: employees.phone,
      status: employees.status,
      jobRoleId: employees.jobRoleId,
      jobRoleNameEn: jobRoles.nameEn,
      createdAt: employees.createdAt,
    })
    .from(employees)
    .innerJoin(jobRoles, eq(employees.jobRoleId, jobRoles.id))
    .where(eq(employees.companyId, companyId))
    .orderBy(desc(employees.createdAt));
}

// Admin (platform_admin) employee browser — cross-company, read-only per
// Phase 3's scope. Caller must have already checked
// authorize("manage_employees", context).
export async function listAllEmployees() {
  return db
    .select({
      id: employees.id,
      fullNameEn: employees.fullNameEn,
      fullNameAr: employees.fullNameAr,
      status: employees.status,
      jobRoleNameEn: jobRoles.nameEn,
      companyName: companies.name,
      createdAt: employees.createdAt,
    })
    .from(employees)
    .innerJoin(jobRoles, eq(employees.jobRoleId, jobRoles.id))
    .innerJoin(companies, eq(employees.companyId, companies.id))
    .orderBy(desc(employees.createdAt));
}
