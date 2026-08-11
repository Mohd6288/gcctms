// cards module — Zod validation for the manufacturer handover.
import { z } from "zod";

export const RecordCardIssuanceInput = z.object({
  cardId: z.number().int().positive(),
  // Comes from the manufacturer, so its shape is theirs, not ours — trimmed
  // and bounded rather than pattern-matched against a format we do not own.
  cardNumber: z.string().trim().min(1).max(60),
});
export type RecordCardIssuanceInput = z.infer<typeof RecordCardIssuanceInput>;

export const RecordCardCollectionInput = z.object({
  cardId: z.number().int().positive(),
  // Often the contractor's representative rather than the technician, which
  // is why the paper receipt form asks for both a name and a number to reach
  // them on.
  collectedByName: z.string().trim().min(1).max(200),
  collectedByMobile: z.string().trim().min(6).max(30),
  receiptDocumentId: z.number().int().positive().optional(),
});
export type RecordCardCollectionInput = z.infer<typeof RecordCardCollectionInput>;

export const ConfirmSchedulingInput = z.object({
  classId: z.number().int().positive(),
  manufacturerId: z.number().int().positive(),
  // Unsettable as well as settable — a date can be un-agreed, and leaving no
  // way back would mean editing the database to fix a misclick.
  confirmed: z.boolean(),
});
export type ConfirmSchedulingInput = z.infer<typeof ConfirmSchedulingInput>;
