#!/usr/bin/env node
// Creates the first super_admin account for local manual testing. Every
// `supabase db reset` wipes auth.users, and there's no self-service way to
// create the FIRST super_admin (the superadmin/users screen requires
// already being one) — this script is the bootstrap out of that chicken-
// and-egg gap. Idempotent: safe to re-run, skips if the profile exists.
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

const API_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const EMAIL = "superadmin@gcclab.test";
const PASSWORD = "SuperAdmin123!";

const sql = postgres(DATABASE_URL, { prepare: false });
const admin = createClient(API_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const [existing] = await sql`
  select p.user_id from profiles p
  join auth.users u on u.id = p.user_id
  where u.email = ${EMAIL} and p.role = 'super_admin'
`;

if (existing) {
  console.log(`Already exists — sign in with ${EMAIL} / ${PASSWORD}`);
  await sql.end();
  process.exit(0);
}

const { data, error } = await admin.auth.admin.createUser({
  email: EMAIL,
  password: PASSWORD,
  email_confirm: true,
});
if (error || !data.user) {
  console.error("Failed to create user:", error?.message);
  process.exit(1);
}

await sql`
  insert into profiles (user_id, role, full_name)
  values (${data.user.id}, 'super_admin', 'Bootstrap Super Admin')
`;

console.log(`Created — sign in with ${EMAIL} / ${PASSWORD}`);
console.log("Note: super_admin requires MFA — you'll be sent to /mfa/enroll on first sign-in.");

await sql.end();
