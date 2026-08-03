create table job_roles (
  id bigint generated always as identity primary key,
  code text not null unique,
  name_en text not null,
  name_ar text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table job_roles enable row level security;

grant select, insert, update, delete on job_roles to authenticated, service_role;

-- Catalog-adjacent: readable by every authenticated role, writable only by
-- super_admin (manage_catalog is super_admin-only per roles-and-workflows.md).
create policy job_roles_select_all on job_roles
  for select
  using (auth.role() = 'authenticated');

create policy job_roles_super_admin_write on job_roles
  for all
  using (auth_role() = 'super_admin')
  with check (auth_role() = 'super_admin');
