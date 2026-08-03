"use server";

import { RegisterCompanyInput } from "./schema";
import { registerCompany } from "./service";

// Public — this IS the entry point (no session/context exists yet), so
// there's no authorize() call here. Everything after account creation
// (employees, documents, requests) is capability-gated from that point on.
export async function registerCompanyAction(input: RegisterCompanyInput) {
  const parsed = RegisterCompanyInput.parse(input);
  return registerCompany(parsed);
}
