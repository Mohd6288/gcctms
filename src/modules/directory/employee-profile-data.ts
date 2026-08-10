// One loader for the employee profile, used by all three portals so the
// auditor, the admin and the contractor cannot drift into showing different
// things about the same person.
//
// Sequential, never Promise.all — concurrent Drizzle calls stall against the
// Supabase pooler (see db/index.ts).
import "server-only";
import type { AuthContext } from "@/modules/platform/auth/shared";
import { assertCanViewCompany } from "./access";
import {
  getEmployeeIdentityStatus,
  getEmployeeProfile,
  getEmployeeProgress,
  getEntityHistory,
  listEmployeeCertificates,
  listEmployeeTraining,
} from "./queries";

export async function loadEmployeeProfile(context: AuthContext | null, employeeId: number) {
  const employee = await getEmployeeProfile(employeeId);
  if (!employee) return null;

  // The scoping check happens after the lookup because it needs the
  // employee's company, and before anything else is fetched. A caller that
  // is not allowed here gets an exception, not a partial page.
  await assertCanViewCompany(context, employee.companyId);

  const identity = await getEmployeeIdentityStatus(employeeId);
  const progress = await getEmployeeProgress(employeeId);
  const certificates = await listEmployeeCertificates(employeeId);
  const training = await listEmployeeTraining(employeeId);
  const history = await getEntityHistory("employee", employeeId);

  return { employee, identity, progress, certificates, training, history };
}

// A page may only turn "you cannot see this" into a redirect. Swallowing
// every error here hid a broken query as a silent bounce back to the list,
// which is exactly how a bug hides in plain sight.
export function notAuthorizedToNull(error: unknown): null {
  if (error instanceof Error && error.message === "Not authorized") return null;
  throw error;
}
