// Supabase client for Client Components — uses the anon key, browser cookies
// carry the session. Only for auth flows (sign-in, MFA enroll/challenge);
// no client component fetches Supabase directly for domain data — see
// project-structure.md.
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
