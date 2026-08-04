"use server";

import { getContext } from "@/modules/platform/auth/service";
import { RevokeCertificateInput } from "./schema";
import { approveAllPendingForClass, approveCertificate, revokeCertificate } from "./service";

async function requireContext() {
  const context = await getContext();
  if (!context) throw new Error("Not authorized");
  return context;
}

export async function approveCertificateAction(certificateId: number) {
  const context = await requireContext();
  return approveCertificate(context, certificateId);
}

export async function approveAllPendingForClassAction(classId: number) {
  const context = await requireContext();
  return approveAllPendingForClass(context, classId);
}

export async function revokeCertificateAction(input: RevokeCertificateInput) {
  const context = await requireContext();
  return revokeCertificate(context, RevokeCertificateInput.parse(input));
}
