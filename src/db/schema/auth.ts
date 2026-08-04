import { bigint, boolean, check, index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { bytea, timestamptz } from "./_helpers";

export const companies = pgTable(
  "companies",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    name: text("name").notNull(),
    crNumber: text("cr_number").notNull().unique(),
    vatNumber: text("vat_number"),
    contactName: text("contact_name").notNull(),
    contactEmail: text("contact_email").notNull(),
    contactPhone: text("contact_phone").notNull(),
    city: text("city"),
    address: text("address"),
    sector: text("sector"),
    region: text("region"),
    contractorCategory: text("contractor_category"),
    ownerUserId: uuid("owner_user_id").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("companies_owner_user_id_idx").on(t.ownerUserId),
    index("companies_status_idx").on(t.status),
    check("companies_status_check", sql`${t.status} in ('pending', 'active', 'suspended')`),
    check("companies_region_check", sql`${t.region} is null or ${t.region} in ('North', 'South', 'East', 'West', 'Central')`),
    check(
      "companies_contractor_category_check",
      sql`${t.contractorCategory} is null or ${t.contractorCategory} in ('Distribution', 'Transmission')`
    ),
  ]
);

export const jobRoles = pgTable(
  "job_roles",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    code: text("code").notNull().unique(),
    nameEn: text("name_en").notNull(),
    nameAr: text("name_ar").notNull(),
    contractorCategory: text("contractor_category"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check(
      "job_roles_contractor_category_check",
      sql`${t.contractorCategory} is null or ${t.contractorCategory} in ('Distribution', 'Transmission')`
    ),
  ]
);

export const trainers = pgTable("trainers", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid("user_id").notNull().unique(),
  fullName: text("full_name").notNull(),
  qualifications: text("qualifications"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

export const profiles = pgTable(
  "profiles",
  {
    userId: uuid("user_id").primaryKey(),
    role: text("role").notNull(),
    companyId: bigint("company_id", { mode: "number" }).references(() => companies.id),
    trainerId: bigint("trainer_id", { mode: "number" }).references(() => trainers.id),
    fullName: text("full_name").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("profiles_company_id_idx").on(t.companyId),
    index("profiles_trainer_id_idx").on(t.trainerId),
    index("profiles_role_idx").on(t.role),
    check("profiles_role_check", sql`${t.role} in ('super_admin', 'platform_admin', 'contractor_manager', 'trainer')`),
  ]
);

export const employees = pgTable(
  "employees",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    companyId: bigint("company_id", { mode: "number" }).notNull().references(() => companies.id),
    fullNameEn: text("full_name_en").notNull(),
    fullNameAr: text("full_name_ar").notNull(),
    nationalIdEnc: bytea("national_id_enc").notNull(),
    nationalIdHash: text("national_id_hash").notNull(),
    jobRoleId: bigint("job_role_id", { mode: "number" }).notNull().references(() => jobRoles.id),
    email: text("email"),
    phone: text("phone"),
    status: text("status").notNull().default("active"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("employees_national_id_hash_key").on(t.nationalIdHash),
    index("employees_company_id_idx").on(t.companyId),
    index("employees_job_role_id_idx").on(t.jobRoleId),
    index("employees_status_idx").on(t.status),
    check("employees_status_check", sql`${t.status} in ('active', 'inactive')`),
  ]
);
