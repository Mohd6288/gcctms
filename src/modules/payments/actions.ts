"use server";

import { getContext } from "@/modules/platform/auth/service";
import { RejectPaymentInput, UploadPaymentReceiptInput } from "./schema";
import { rejectPayment, uploadPaymentReceipt, verifyPayment } from "./service";

async function requireContext() {
  const context = await getContext();
  if (!context) throw new Error("Not authorized");
  return context;
}

export async function uploadPaymentReceiptAction(formData: FormData) {
  const context = await requireContext();
  const { requestId } = UploadPaymentReceiptInput.parse({ requestId: Number(formData.get("requestId")) });

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("No file provided");

  return uploadPaymentReceipt(context, requestId, file);
}

export async function verifyPaymentAction(paymentId: number) {
  const context = await requireContext();
  return verifyPayment(context, paymentId);
}

export async function rejectPaymentAction(input: RejectPaymentInput) {
  const context = await requireContext();
  const parsed = RejectPaymentInput.parse(input);
  return rejectPayment(context, parsed.paymentId, parsed.reason);
}
