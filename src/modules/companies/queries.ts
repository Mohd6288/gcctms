// companies module — read-side queries (Drizzle, RLS-scoped via lib/supabase/server.ts).
import "server-only";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { companies } from "@/db/schema";

// Admin (platform_admin) company directory — read-only per Phase 3's scope
// (no approval queue yet, since there's no pending state to approve out of
// until CR verification is un-deferred). Caller must have already checked
// authorize("manage_companies", context).
export async function listCompanies() {
  return db
    .select({
      id: companies.id,
      name: companies.name,
      crNumber: companies.crNumber,
      contactName: companies.contactName,
      contactEmail: companies.contactEmail,
      city: companies.city,
      status: companies.status,
      createdAt: companies.createdAt,
    })
    .from(companies)
    .orderBy(desc(companies.createdAt));
}
