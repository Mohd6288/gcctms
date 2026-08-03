import type { Config } from "drizzle-kit";

// DATABASE_URL points at the local Supabase Postgres instance in dev (`supabase start`),
// and at the linked Supabase project's connection string in CI/staging/prod — never
// committed, always from platform env (see security-and-hosting.md).
export default {
  schema: "./src/db/schema/*.ts",
  out: "./supabase/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  },
} satisfies Config;
