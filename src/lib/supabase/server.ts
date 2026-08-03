// Supabase client for Server Components/Actions/Route Handlers — uses the anon key
// plus the caller's session cookie, so Postgres RLS scopes every query to the
// current user automatically. Prefer this over db/index.ts (Drizzle) whenever you
// want RLS to do the tenant-isolation work for you.
import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component — a middleware/proxy refreshing the
            // session handles this instead. Safe to ignore here.
          }
        },
      },
    }
  );
}
