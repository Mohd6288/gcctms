"use server";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { employees } from "@/db/schema";
import { getContext } from "@/modules/platform/auth/service";
import { getEmployeeEligibilitySnapshot } from "./queries";
import {
  CreateCityInput,
  SetCityActiveInput,
  CreateCourseInput,
  CreatePricingInput,
  CreateTrainerInput,
  CreateTrainerLoginInput,
  CreateTrainingCenterInput,
  SetCoursePrerequisitesInput,
  SetCourseJobRolesInput,
  UpdateCourseInput,
  UpdateTrainerInput,
  UpdateTrainingCenterInput,
} from "./schema";
import {
  createCity,
  setCityActive,
  createCourse,
  createPricing,
  createTrainer,
  createTrainerLogin,
  createAllTrainerLogins,
  createTrainingCenter,
  endPricing,
  setCoursePrerequisites,
  setCourseJobRoles,
  updateCourse,
  updateTrainer,
  updateTrainingCenter,
} from "./service";

async function requireContext() {
  const context = await getContext();
  if (!context) throw new Error("Not authorized");
  return context;
}

export async function createCourseAction(input: CreateCourseInput) {
  const context = await requireContext();
  return createCourse(context, CreateCourseInput.parse(input));
}

export async function updateCourseAction(input: UpdateCourseInput) {
  const context = await requireContext();
  return updateCourse(context, UpdateCourseInput.parse(input));
}

export async function setCourseJobRolesAction(input: SetCourseJobRolesInput) {
  const context = await requireContext();
  return setCourseJobRoles(context, SetCourseJobRolesInput.parse(input));
}

export async function setCoursePrerequisitesAction(input: SetCoursePrerequisitesInput) {
  const context = await requireContext();
  return setCoursePrerequisites(context, SetCoursePrerequisitesInput.parse(input));
}

export async function createTrainingCenterAction(input: CreateTrainingCenterInput) {
  const context = await requireContext();
  return createTrainingCenter(context, CreateTrainingCenterInput.parse(input));
}

export async function updateTrainingCenterAction(input: UpdateTrainingCenterInput) {
  const context = await requireContext();
  return updateTrainingCenter(context, UpdateTrainingCenterInput.parse(input));
}

export async function createPricingAction(input: CreatePricingInput) {
  const context = await requireContext();
  return createPricing(context, CreatePricingInput.parse(input));
}

export async function endPricingAction(pricingId: number, effectiveTo: string) {
  const context = await requireContext();
  return endPricing(context, pricingId, effectiveTo);
}

export async function createCityAction(input: CreateCityInput) {
  const context = await requireContext();
  return createCity(context, CreateCityInput.parse(input));
}

export async function setCityActiveAction(input: SetCityActiveInput) {
  const context = await requireContext();
  return setCityActive(context, SetCityActiveInput.parse(input));
}

export async function createTrainerLoginAction(input: CreateTrainerLoginInput) {
  const context = await requireContext();
  return createTrainerLogin(context, CreateTrainerLoginInput.parse(input));
}

export async function createAllTrainerLoginsAction() {
  const context = await requireContext();
  return createAllTrainerLogins(context);
}

export async function createTrainerAction(input: CreateTrainerInput) {
  const context = await requireContext();
  return createTrainer(context, CreateTrainerInput.parse(input));
}

export async function updateTrainerAction(input: UpdateTrainerInput) {
  const context = await requireContext();
  return updateTrainer(context, UpdateTrainerInput.parse(input));
}

// Read-only, advisory info for the request wizard's employee table — scoped
// to the caller's own company so it can't be used to probe another
// company's roster.
export async function getEmployeeEligibilitySnapshotAction(courseId: number, employeeIds: number[]) {
  const context = await requireContext();
  if (!context.companyId || employeeIds.length === 0) return [];

  const owned = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(inArray(employees.id, employeeIds), eq(employees.companyId, context.companyId)));
  const ownedIds = owned.map((e) => e.id);

  const snapshot = await getEmployeeEligibilitySnapshot(courseId, ownedIds);
  return Array.from(snapshot.entries()).map(([employeeId, info]) => ({ employeeId, ...info }));
}
