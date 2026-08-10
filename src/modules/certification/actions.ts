"use server";

import { getContext } from "@/modules/platform/auth/service";
import { runGuarded } from "@/modules/platform/guard-error";
import { RevokeCertificateInput } from "./schema";
import { approveAllPendingForClass, approveCertificate, revokeCertificate } from "./service";

async function requireContext() {
  const context = await getContext();
  if (!context) throw new Error("Not authorized");
  return context;
}

// Returned, not thrown — "this certificate is already issued" is a sentence
// the admin needs to read, and a thrown Error reaches production as React's
// minified #441 text. See platform/guard-error.ts.
export async function approveCertificateAction(certificateId: number) {
  const context = await requireContext();
  return runGuarded(() => approveCertificate(context, certificateId));
}

export async function approveAllPendingForClassAction(classId: number) {
  const context = await requireContext();
  return runGuarded(() => approveAllPendingForClass(context, classId));
}

export async function revokeCertificateAction(input: RevokeCertificateInput) {
  const context = await requireContext();
  return runGuarded(() => revokeCertificate(context, RevokeCertificateInput.parse(input)));
}
