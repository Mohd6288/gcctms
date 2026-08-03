import { z } from "zod";

// Iqama (residency ID) only — 10 digits, per SEC registration policy (no
// border IDs). Validated at input, not just presence — see
// database-schema.md's employees note.
const iqamaSchema = z.string().regex(/^\d{10}$/, "Must be a 10-digit Iqama number");

export const CreateEmployeeInput = z.object({
  companyId: z.number().int().positive(),
  fullNameEn: z.string().min(1),
  fullNameAr: z.string().min(1),
  nationalId: iqamaSchema,
  jobRoleId: z.number().int().positive(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
});

export type CreateEmployeeInput = z.infer<typeof CreateEmployeeInput>;

export const UpdateEmployeeInput = z.object({
  employeeId: z.number().int().positive(),
  fullNameEn: z.string().min(1),
  fullNameAr: z.string().min(1),
  jobRoleId: z.number().int().positive(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  status: z.enum(["active", "inactive"]),
});

export type UpdateEmployeeInput = z.infer<typeof UpdateEmployeeInput>;
