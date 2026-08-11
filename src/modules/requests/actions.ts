"use server";

import { getContext } from "@/modules/platform/auth/service";
import { runGuarded } from "@/modules/platform/guard-error";
import {
  ApproveRequestInput,
  ChangeRequestCourseInput,
  CreateDraftRequestInput,
  ReassignRequestInput,
  RejectRequestDocumentInput,
  RejectRequestInput,
  RequestMoreInfoInput,
  SetEmployeeDecisionInput,
  SyncRequestItemsInput,
  UpdateDraftRequestInput,
  VerifyRequestDocumentInput,
} from "./schema";
import {
  approveRequest,
  changeRequestCourse,
  closeRequest,
  createDraftRequest,
  reassignRequest,
  rejectRequest,
  rejectRequestDocument,
  requestMoreInfo,
  setEmployeeDecision,
  submitRequest,
  syncRequestItems,
  updateDraftRequest,
  verifyRequestDocument,
} from "./service";

async function requireContext() {
  const context = await getContext();
  if (!context) throw new Error("Not authorized");
  return context;
}

export async function createDraftRequestAction(input: CreateDraftRequestInput) {
  const context = await requireContext();
  return createDraftRequest(context, CreateDraftRequestInput.parse(input));
}

export async function updateDraftRequestAction(input: UpdateDraftRequestInput) {
  const context = await requireContext();
  return updateDraftRequest(context, UpdateDraftRequestInput.parse(input));
}

export async function syncRequestItemsAction(input: SyncRequestItemsInput) {
  const context = await requireContext();
  return syncRequestItems(context, SyncRequestItemsInput.parse(input));
}

export async function submitRequestAction(requestId: number) {
  const context = await requireContext();
  return submitRequest(context, requestId);
}

export async function reassignRequestAction(input: ReassignRequestInput) {
  const context = await requireContext();
  return runGuarded(() => reassignRequest(context, ReassignRequestInput.parse(input)));
}

export async function changeRequestCourseAction(input: ChangeRequestCourseInput) {
  const context = await requireContext();
  return runGuarded(() => changeRequestCourse(context, ChangeRequestCourseInput.parse(input)));
}

export async function setEmployeeDecisionAction(input: SetEmployeeDecisionInput) {
  const context = await requireContext();
  return setEmployeeDecision(context, SetEmployeeDecisionInput.parse(input));
}

export async function verifyRequestDocumentAction(input: VerifyRequestDocumentInput) {
  const context = await requireContext();
  return verifyRequestDocument(context, VerifyRequestDocumentInput.parse(input));
}

export async function rejectRequestDocumentAction(input: RejectRequestDocumentInput) {
  const context = await requireContext();
  return rejectRequestDocument(context, RejectRequestDocumentInput.parse(input));
}

export async function approveRequestAction(input: ApproveRequestInput) {
  const context = await requireContext();
  const parsed = ApproveRequestInput.parse(input);
  // Guarded: approval is where an unpriced course surfaces, and "enter the
  // amount below" is only useful if the admin can read it. Thrown Server
  // Action errors reach production as a minified React code.
  return runGuarded(() => approveRequest(context, parsed.requestId, parsed.unitPrice));
}

export async function requestMoreInfoAction(input: RequestMoreInfoInput) {
  const context = await requireContext();
  return requestMoreInfo(context, RequestMoreInfoInput.parse(input));
}

export async function rejectRequestAction(input: RejectRequestInput) {
  const context = await requireContext();
  return rejectRequest(context, RejectRequestInput.parse(input));
}

export async function closeRequestAction(requestId: number) {
  const context = await requireContext();
  return closeRequest(context, requestId);
}
