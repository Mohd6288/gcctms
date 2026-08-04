// companies module — business logic (Server Actions call into here, never touch db/ directly for RLS-scoped ops).
import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { companies, profiles } from "@/db/schema";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize, type AuthContext } from "@/modules/platform/auth/shared";
import { writeAudit } from "@/modules/platform/audit/service";
import type { RegisterCompanyInput, UpdateCompanyInput } from "./schema";

// Self-registration: sets status = 'active' immediately, no manual CR
// verification step — deliberately deferred, see roles-and-workflows.md's
// "Company & employee rules". A registered company can submit requests
// right away.
export async function registerCompany(input: RegisterCompanyInput) {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: input.contactEmail,
    password: input.password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(error?.code === "email_exists" ? "An account with this email already exists." : "Could not create account.");
  }
  const userId = data.user.id;

  try {
    const [company] = await db
      .insert(companies)
      .values({
        name: input.name,
        crNumber: input.crNumber,
        vatNumber: input.vatNumber,
        contactName: input.contactName,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
        city: input.city,
        address: input.address,
        sector: input.sector,
        region: input.region,
        contractorCategory: input.contractorCategory,
        ownerUserId: userId,
        status: "active",
      })
      .returning({ id: companies.id });

    await db.insert(profiles).values({
      userId,
      role: "contractor_manager",
      fullName: input.contactName,
      companyId: company.id,
    });

    await writeAudit({
      userId,
      entityType: "company",
      entityId: company.id,
      action: "register",
      toStatus: "active",
    });

    return { userId, companyId: company.id };
  } catch (err) {
    // Roll back the auth account so a failed registration doesn't leave an
    // orphaned login with no company/profile behind it.
    await admin.auth.admin.deleteUser(userId);
    // Drizzle wraps the real Postgres error in DrizzleQueryError — the
    // SQLSTATE code lives on .cause, not the top-level error.
    const pgCode = (err as { cause?: { code?: string } })?.cause?.code;
    if (pgCode === "23505") {
      throw new Error("A company with this CR number is already registered.");
    }
    throw err;
  }
}

// Shared by the contractor's own profile edit and the admin company-detail
// edit — CR number, verification, region, and contractor category are
// admin-only (matches the validated prototype's EditCompanyDialog vs. the
// contractor's own read-only CompanyProfile.tsx fields); silently ignored
// rather than rejected if a non-admin caller sends them, since neither UI
// exposes them to a contractor in the first place.
export async function updateCompany(context: AuthContext, input: UpdateCompanyInput) {
  if (!authorize("manage_companies", context)) throw new Error("Not authorized");
  if (context.role === "contractor_manager" && context.companyId !== input.companyId) {
    throw new Error("Not authorized");
  }

  const isAdmin = context.role === "platform_admin" || context.role === "super_admin";
  const set: Partial<typeof companies.$inferInsert> = {
    name: input.name,
    sector: input.sector,
    city: input.city,
    contactName: input.contactName,
    contactEmail: input.contactEmail,
    contactPhone: input.contactPhone,
  };
  if (isAdmin) {
    if (input.crNumber !== undefined) set.crNumber = input.crNumber;
    if (input.crVerified !== undefined) set.crVerified = input.crVerified;
    if (input.region !== undefined) set.region = input.region;
    if (input.contractorCategory !== undefined) set.contractorCategory = input.contractorCategory;
  }

  await db.update(companies).set(set).where(eq(companies.id, input.companyId));
  await writeAudit({ userId: context.userId, entityType: "company", entityId: input.companyId, action: "update" });
}
