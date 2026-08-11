"use server";

import { getContext } from "@/modules/platform/auth/service";
import { runGuarded } from "@/modules/platform/guard-error";
import { ConfirmSchedulingInput, RecordCardCollectionInput, RecordCardIssuanceInput } from "./schema";
import {
  confirmManufacturerScheduling,
  dispatchPassList,
  getPassListUrl,
  recordCardCollection,
  recordCardIssuance,
  sendTestGuidelines,
} from "./service";

async function requireContext() {
  const context = await getContext();
  if (!context) throw new Error("Not authorized");
  return context;
}

// All guarded: "no contact email on file", "no cards awaiting the
// manufacturer", "the manufacturer has not reported this card issued yet" are
// every one of them a message an admin has to read and act on, and a thrown
// Server Action error reaches them as a minified React code instead.
export async function dispatchPassListAction(classId: number) {
  const context = await requireContext();
  return runGuarded(() => dispatchPassList(context, classId));
}

export async function getPassListUrlAction(dispatchId: number) {
  const context = await requireContext();
  return runGuarded(() => getPassListUrl(context, dispatchId));
}

export async function recordCardIssuanceAction(input: RecordCardIssuanceInput) {
  const context = await requireContext();
  return runGuarded(() => recordCardIssuance(context, RecordCardIssuanceInput.parse(input)));
}

export async function recordCardCollectionAction(input: RecordCardCollectionInput) {
  const context = await requireContext();
  return runGuarded(() => recordCardCollection(context, RecordCardCollectionInput.parse(input)));
}

export async function confirmManufacturerSchedulingAction(input: ConfirmSchedulingInput) {
  const context = await requireContext();
  return runGuarded(() => confirmManufacturerScheduling(context, ConfirmSchedulingInput.parse(input)));
}

export async function sendTestGuidelinesAction(classId: number) {
  const context = await requireContext();
  return runGuarded(() => sendTestGuidelines(context, classId));
}
