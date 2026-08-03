// Supabase client using the service_role key — bypasses RLS entirely.
//
// ⚠️ SECURITY: server-only, NEVER import this in any file reachable from a Client
// Component bundle (grep for `service_role` runs in CI to catch this — see
// .github/workflows/ci.yml). Every call site must call authorize() explicitly,
// same rule as db/index.ts.
import "server-only";
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
