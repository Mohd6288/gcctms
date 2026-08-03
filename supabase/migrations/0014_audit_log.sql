-- Append-only: no UPDATE/DELETE policy exists for any role, so once RLS is
-- enforced (i.e. reached through the 'authenticated' Postgres role) no one
-- can alter or remove a row. Writes happen server-side (Drizzle's db/index.ts
-- or a service-role client), which bypasses RLS by design — see
-- project-structure.md's Drizzle/RLS caveat and security-and-hosting.md.
create table audit_log (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  entity_type text not null,
  entity_id bigint not null,
  action text not null,
  from_status text,
  to_status text,
  note text,
  ip inet,
  created_at timestamptz not null default now()
);

create index audit_log_entity_idx on audit_log (entity_type, entity_id);
create index audit_log_user_id_idx on audit_log (user_id);
create index audit_log_created_at_idx on audit_log (created_at);

alter table audit_log enable row level security;

-- authenticated: SELECT only (gated further by the policy below to admins).
-- service_role: full CRUD — server-side jobs write audit rows via the
-- service-role client, bypassing RLS by role attribute, not by policy.
grant select on audit_log to authenticated;
grant select, insert, update, delete on audit_log to service_role;

-- SELECT admin-only (view_audit_log capability).
create policy audit_log_admin_select on audit_log
  for select
  using (auth_role() in ('super_admin', 'platform_admin'));

-- No INSERT/UPDATE/DELETE policy for any app role: append-only, server-only.
