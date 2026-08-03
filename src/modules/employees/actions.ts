"use server";

import { getContext } from "@/modules/platform/auth/service";
import { CreateEmployeeInput, UpdateEmployeeInput } from "./schema";
import { createEmployee, updateEmployee } from "./service";

export async function createEmployeeAction(input: CreateEmployeeInput) {
  const context = await getContext();
  if (!context) throw new Error("Not authorized");
  return createEmployee(context, CreateEmployeeInput.parse(input));
}

export async function updateEmployeeAction(input: UpdateEmployeeInput) {
  const context = await getContext();
  if (!context) throw new Error("Not authorized");
  return updateEmployee(context, UpdateEmployeeInput.parse(input));
}
