// certification module — Zod validation schemas for this module's mutations.
import { z } from "zod";

export const RevokeCertificateInput = z.object({
  certificateId: z.number().int().positive(),
  reason: z.string().min(1),
});
export type RevokeCertificateInput = z.infer<typeof RevokeCertificateInput>;
