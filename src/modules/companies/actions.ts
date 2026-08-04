"use server";

import { getContext } from "@/modules/platform/auth/service";
import { RegisterCompanyInput, UpdateCompanyInput } from "./schema";
import { registerCompany, updateCompany } from "./service";

// Public — this IS the entry point (no session/context exists yet), so
// there's no authorize() call here. Everything after account creation
// (employees, documents, requests) is capability-gated from that point on.
export async function registerCompanyAction(input: RegisterCompanyInput) {
  const parsed = RegisterCompanyInput.parse(input);
  return registerCompany(parsed);
}

export async function updateCompanyAction(input: UpdateCompanyInput) {
  const context = await getContext();
  if (!context) throw new Error("Not authorized");
  return updateCompany(context, UpdateCompanyInput.parse(input));
}
