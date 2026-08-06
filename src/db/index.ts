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
// already doing the real pooling across every other instance. Bumped from 1
// to 3 after finding that routes firing several queries via Promise.all
// (e.g. getPlatformOverviewStats) serialize all of them onto one physical
// connection; under concurrent requests to the same warm instance the
// resulting queue depth was long enough for a query to blow past Postgres's
// statement_timeout — which then surfaced as an unhandled rejection that
// crashed the whole instance (call sites must still catch DB errors
// regardless, a query failure should never take the process down).
import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// idle_timeout/connect_timeout are both deliberate, and both are about
// FAILING FAST rather than about throughput. postgres.js defaults to never
// closing an idle connection and to a 30s connect timeout, which is a bad
// combination behind Supabase's transaction pooler: Supavisor drops idle
// client connections on its own schedule, so a warm Vercel instance that
// has been quiet for a while can hand the next request a socket the server
// already closed. Nothing notices until TCP retransmits give up, so the
// request hangs for minutes instead of erroring — observed in production
// as a dynamic route stalling past 2 minutes and then recovering on its
// own. Expiring our own idle connections first (20s, comfortably under the
// pooler's window) means we reconnect rather than reuse a corpse, and
// bounding the connect leg at 10s turns a dead network path into a real
// error a route can catch. Cheap now that functions run in fra1 alongside
// the database (vercel.json) — a reconnect there costs single-digit ms, so
// the extra reconnects this causes are not worth optimising away.
const client = postgres(connectionString, {
  prepare: false,
  max: 3,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });
