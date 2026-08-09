import { z } from "zod";
import { REGIONS } from "@/lib/regions";

const CONTRACTOR_CATEGORIES = ["Distribution", "Transmission"] as const;

// The contact email doubles as the contractor_manager login — one email,
// one account, matching the validated prototype's single-admin-per-company
// model (see roles-and-workflows.md).
//
// sector and region are required (matches the prototype's Register.tsx —
// both are plain required fields, region defaults to 'Central' in the UI
// but is always sent). contractorCategory is optional: it gates course and
// job-role visibility (see requests/queries.ts's listActiveCourses() and
// employees/queries.ts's listActiveJobRoles()) but many companies never set
// it.
export const RegisterCompanyInput = z.object({
  name: z.string().min(1),
  crNumber: z.string().min(1),
  vatNumber: z.string().optional(),
  contactName: z.string().min(1),
  contactEmail: z.string().email(),
  contactPhone: z.string().min(1),
  city: z.string().optional(),
  address: z.string().optional(),
  sector: z.string().min(1),
  region: z.enum(REGIONS),
  contractorCategory: z.enum(CONTRACTOR_CATEGORIES).optional(),
  password: z.string().min(10),
});

export type RegisterCompanyInput = z.infer<typeof RegisterCompanyInput>;

// Shared by the contractor's own profile edit and the admin company-detail
// edit dialog — service.ts applies crNumber/crVerified/region/
// contractorCategory only for admin roles, matching the validated
// prototype's split between CompanyProfile.tsx (self-service, those four
// fields read-only) and EditCompanyDialog.tsx (admin-only, all editable).
export const UpdateCompanyInput = z.object({
  companyId: z.number().int().positive(),
  name: z.string().min(1),
  sector: z.string().min(1),
  city: z.string().min(1),
  contactName: z.string().min(1),
  contactEmail: z.string().email(),
  contactPhone: z.string().min(1),
  crNumber: z.string().min(1).optional(),
  crVerified: z.boolean().optional(),
  region: z.enum(REGIONS).optional(),
  contractorCategory: z.enum(CONTRACTOR_CATEGORIES).optional(),
});
export type UpdateCompanyInput = z.infer<typeof UpdateCompanyInput>;
