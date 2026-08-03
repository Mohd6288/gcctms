#!/usr/bin/env node
// Fails the build if any table in the public schema doesn't have Row Level
// Security enabled. Golden Rule 1 (tms-react-builder skill): every
// company-owned table gets RLS + policies in the same migration, no exceptions.
import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const sql = postgres(connectionString, { prepare: false });

try {
  const tables = await sql`
    select relname
    from pg_class
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relkind = 'r'
      and not pg_class.relrowsecurity
  `;

  if (tables.length > 0) {
    console.error("RLS check FAILED — the following public tables do not have Row Level Security enabled:");
    for (const t of tables) console.error(`  - ${t.relname}`);
    process.exit(1);
  }

  const allTables = await sql`
    select count(*)::int as count
    from pg_class
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public' and pg_class.relkind = 'r'
  `;

  console.log(`RLS check passed — ${allTables[0].count} public table(s), all with RLS enabled.`);
} finally {
  await sql.end();
}
