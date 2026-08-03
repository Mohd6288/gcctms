import { z } from "zod";

export const UploadPaymentReceiptInput = z.object({
  requestId: z.number().int().positive(),
});
export type UploadPaymentReceiptInput = z.infer<typeof UploadPaymentReceiptInput>;

export const RejectPaymentInput = z.object({
  paymentId: z.number().int().positive(),
  reason: z.string().min(1),
});
export type RejectPaymentInput = z.infer<typeof RejectPaymentInput>;
