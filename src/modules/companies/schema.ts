import { z } from "zod";

// The contact email doubles as the contractor_manager login — one email,
// one account, matching the validated prototype's single-admin-per-company
// model (see roles-and-workflows.md).
export const RegisterCompanyInput = z.object({
  name: z.string().min(1),
  crNumber: z.string().min(1),
  vatNumber: z.string().optional(),
  contactName: z.string().min(1),
  contactEmail: z.string().email(),
  contactPhone: z.string().min(1),
  city: z.string().optional(),
  address: z.string().optional(),
  password: z.string().min(10),
});

export type RegisterCompanyInput = z.infer<typeof RegisterCompanyInput>;
