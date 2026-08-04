import { z } from "zod";

const REGIONS = ["North", "South", "East", "West", "Central"] as const;
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
