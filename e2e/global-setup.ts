import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

// One super admin for the suite. Created here rather than seeded by SQL
// because the account has to exist in Supabase Auth, not just in profiles.
export default async function globalSetup() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const databaseUrl = process.env.DATABASE_URL;
  if (!serviceRole || !databaseUrl) throw new Error("E2E needs SUPABASE_SERVICE_ROLE_KEY and DATABASE_URL");

  const admin = createClient(url, serviceRole, { auth: { persistSession: false } });
  const email = "e2e-superadmin@gcclab.test";
  const sql = postgres(databaseUrl);

  // Looked up by email against the table, NOT via listUsers().
  //
  // listUsers() is paginated and returns only the first 50. Once this database
  // had more accounts than that, the existing e2e user stopped being found,
  // createUser() then failed on the duplicate email, and the whole browser
  // suite died in setup on `.data.user!.id` being null — a failure that looked
  // like a broken app and was really a page boundary.
  const existing = await sql<{ id: string }[]>`select id from auth.users where email = ${email} limit 1`;
  const userId =
    existing[0]?.id ??
    (await admin.auth.admin.createUser({ email, password: "E2ePassw0rd!", email_confirm: true })).data.user!.id;

  await sql`
    insert into profiles (user_id, role, full_name) values (${userId}, 'super_admin', 'E2E Super Admin')
    on conflict (user_id) do update set role = 'super_admin', active = true
  `;
  await sql.end();
}
