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

  const { data } = await admin.auth.admin.listUsers();
  const userId =
    data.users.find((u) => u.email === email)?.id ??
    (await admin.auth.admin.createUser({ email, password: "E2ePassw0rd!", email_confirm: true })).data.user!.id;

  const sql = postgres(databaseUrl);
  await sql`
    insert into profiles (user_id, role, full_name) values (${userId}, 'super_admin', 'E2E Super Admin')
    on conflict (user_id) do update set role = 'super_admin', active = true
  `;
  await sql.end();
}
