// companies module — read-side queries (Drizzle, RLS-scoped via lib/supabase/server.ts).
import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { companies } from "@/db/schema";

// Admin (platform_admin) company directory — read-only per Phase 3's scope
// (no approval queue yet, since there's no pending state to approve out of
// until CR verification is un-deferred). Caller must have already checked
// authorize("manage_companies", context).
//
// region: pass context.region (Phase 5) — Drizzle bypasses RLS (see
// db/index.ts), so region scoping for platform_admin has to be applied
// explicitly here too, not just in the RLS policy. null/undefined means
// unassigned (unrestricted), matching requireRole()'s own default.
export async function listCompanies(region?: string | null) {
  return db
    .select({
      id: companies.id,
      name: companies.name,
      crNumber: companies.crNumber,
      contactName: companies.contactName,
      contactEmail: companies.contactEmail,
      city: companies.city,
      region: companies.region,
      status: companies.status,
      createdAt: companies.createdAt,
    })
    .from(companies)
    .where(region ? eq(companies.region, region) : undefined)
    .orderBy(desc(companies.createdAt));
}

export async function getCompanyById(companyId: number) {
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
  return company ?? null;
}
