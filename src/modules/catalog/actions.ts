"use server";

import { getContext } from "@/modules/platform/auth/service";
import {
  CreateCourseInput,
  CreateExamInput,
  CreatePricingInput,
  CreateTrainerInput,
  CreateTrainingCenterInput,
  SetCourseJobRolesInput,
  UpdateCourseInput,
  UpdateExamInput,
  UpdateTrainerInput,
  UpdateTrainingCenterInput,
} from "./schema";
import {
  createCourse,
  createExam,
  createPricing,
  createTrainer,
  createTrainingCenter,
  endPricing,
  setCourseJobRoles,
  updateCourse,
  updateExam,
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

export async function createExamAction(input: CreateExamInput) {
  const context = await requireContext();
  return createExam(context, CreateExamInput.parse(input));
}

export async function updateExamAction(input: UpdateExamInput) {
  const context = await requireContext();
  return updateExam(context, UpdateExamInput.parse(input));
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

export async function createTrainerAction(input: CreateTrainerInput) {
  const context = await requireContext();
  return createTrainer(context, CreateTrainerInput.parse(input));
}

export async function updateTrainerAction(input: UpdateTrainerInput) {
  const context = await requireContext();
  return updateTrainer(context, UpdateTrainerInput.parse(input));
}
