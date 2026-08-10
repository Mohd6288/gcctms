"use server";

import { getContext } from "@/modules/platform/auth/service";
import { runGuarded } from "@/modules/platform/guard-error";
import {
  AssignRequestItemRegionInput,
  CancelClassInput,
  CreateClassInput,
  EnrollRequestItemInput,
  MoveEnrollmentInput,
  SetAdminRegionInput,
  UpdateClassInput,
} from "./schema";
import {
  assignRequestItemRegion,
  autoAssignPooledByPreference,
  cancelClass,
  createClass,
  enrollRequestItem,
  moveEnrollment,
  removeEnrollment,
  removeFromWaitlist,
  setAdminRegion,
  startClass,
  unassignRequestItemRegion,
  updateClass,
} from "./service";

async function requireContext() {
  const context = await getContext();
  if (!context) throw new Error("Not authorized");
  return context;
}

export async function moveEnrollmentAction(input: MoveEnrollmentInput) {
  const context = await requireContext();
  return runGuarded(() => moveEnrollment(context, MoveEnrollmentInput.parse(input)));
}

export async function assignRequestItemRegionAction(input: AssignRequestItemRegionInput) {
  const context = await requireContext();
  return assignRequestItemRegion(context, AssignRequestItemRegionInput.parse(input));
}

export async function unassignRequestItemRegionAction(requestItemId: number) {
  const context = await requireContext();
  return unassignRequestItemRegion(context, requestItemId);
}

export async function autoAssignPooledByPreferenceAction() {
  const context = await requireContext();
  return autoAssignPooledByPreference(context);
}

export async function setAdminRegionAction(input: SetAdminRegionInput) {
  const context = await requireContext();
  return setAdminRegion(context, SetAdminRegionInput.parse(input));
}

// Returns a result rather than throwing, so the refusal survives the Server
// Action boundary — see platform/guard-error.ts.
export async function createClassAction(input: CreateClassInput) {
  const context = await requireContext();
  return runGuarded(() => createClass(context, CreateClassInput.parse(input)));
}

export async function updateClassAction(input: UpdateClassInput) {
  const context = await requireContext();
  return runGuarded(() => updateClass(context, UpdateClassInput.parse(input)));
}

export async function startClassAction(classId: number) {
  const context = await requireContext();
  return startClass(context, classId);
}

export async function cancelClassAction(input: CancelClassInput) {
  const context = await requireContext();
  return cancelClass(context, CancelClassInput.parse(input));
}

export async function enrollRequestItemAction(input: EnrollRequestItemInput) {
  const context = await requireContext();
  return enrollRequestItem(context, EnrollRequestItemInput.parse(input));
}

export async function removeEnrollmentAction(enrollmentId: number) {
  const context = await requireContext();
  return removeEnrollment(context, enrollmentId);
}

export async function removeFromWaitlistAction(enrollmentId: number) {
  const context = await requireContext();
  return removeFromWaitlist(context, enrollmentId);
}
