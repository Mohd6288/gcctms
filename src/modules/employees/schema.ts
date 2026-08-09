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
  nationality: z.string().optional(),
  activity: z.string().optional(),
  contractorArea: z.string().optional(),
  contractorCity: z.string().optional(),
});

export type CreateEmployeeInput = z.infer<typeof CreateEmployeeInput>;

export const UpdateEmployeeInput = z.object({
  employeeId: z.number().int().positive(),
  fullNameEn: z.string().min(1),
  fullNameAr: z.string().min(1),
  jobRoleId: z.number().int().positive(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  nationality: z.string().optional(),
  activity: z.string().optional(),
  contractorArea: z.string().optional(),
  contractorCity: z.string().optional(),
  status: z.enum(["active", "inactive"]),
});

export type UpdateEmployeeInput = z.infer<typeof UpdateEmployeeInput>;

// Rows parsed client-side from a Registration Sheet or HRBL_0004_FO_001
// Excel upload. Both forms' job column is free text copied off the
// candidate's Iqama ("المهنة طبقا للإقامة"), so jobTitleText rarely equals a
// canonical job role — real uploads carry "Electrical, Engineer",
// "TECHNICIAN, ELECTRICAL", "مهندس كهربائي". jobRoleId is what the
// contractor picked for that row in the import panel; importEmployees still
// falls back to matching jobTitleText by name when the sheet happens to
// carry a canonical one.
// nationalId isn't strictly validated here (loose enough to still count the
// row) — importEmployees reports the real per-row reason a row was skipped,
// matching the validated prototype's invalid/duplicate row counts.
export const ImportEmployeeRow = z.object({
  fullName: z.string().min(1),
  nationalId: z.string().min(1),
  jobTitleText: z.string().optional(),
  jobRoleId: z.number().int().positive().optional(),
  nationality: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  activity: z.string().optional(),
  contractorArea: z.string().optional(),
  contractorCity: z.string().optional(),
});
export type ImportEmployeeRow = z.infer<typeof ImportEmployeeRow>;

export const ImportEmployeesInput = z.object({
  companyId: z.number().int().positive(),
  rows: z.array(ImportEmployeeRow).min(1).max(200),
});
export type ImportEmployeesInput = z.infer<typeof ImportEmployeesInput>;
