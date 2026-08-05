// Drizzle client — direct Postgres connection.
//
// ⚠️ SECURITY: this connection does NOT carry the caller's JWT claims, so Postgres
// RLS policies do not scope it to the current user — it behaves like the
// service_role key (RLS-bypassing), same as lib/supabase/admin.ts.
// Every call site using this db client MUST call authorize(capability, context)
// from modules/platform/auth/service.ts explicitly before touching data.
//
// If you want RLS to scope a query to the current user automatically, use
// lib/supabase/server.ts's Supabase client instead of this Drizzle client.
//
// DATABASE_URL must point at Supabase's TRANSACTION-mode pooler (port 6543),
// not session mode (5432) — found the hard way in production: every Vercel
// serverless invocation can open its own connection, and session mode's cap
// is a low fixed number of concurrent clients (15 on the free tier), so it
// exhausts almost immediately under any real traffic (EMAXCONNSESSION).
// Transaction mode is built for exactly this — many short-lived logical
// connections sharing a much smaller pool of real Postgres backends. Session
// mode (5432) is still correct for `supabase db push`/migrations, which
// need session-level features transaction pooling doesn't support — just
// not for this app-runtime client. `max: 1` is also set deliberately, not
// left at postgres.js's default of 10: one serverless instance has no
// business holding 10 of its own connections when the external pooler is
// already doing the real pooling across every other instance.
import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const client = postgres(connectionString, { prepare: false, max: 1 });

export const db = drizzle(client, { schema });
