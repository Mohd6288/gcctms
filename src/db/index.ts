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
import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });
