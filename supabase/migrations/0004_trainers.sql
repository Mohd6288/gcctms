create table trainers (
  id bigint generated always as identity primary key,
  user_id uuid not null unique references auth.users (id) on delete restrict,
  full_name text not null,
  qualifications text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table trainers enable row level security;

grant select, insert, update, delete on trainers to authenticated, service_role;

-- super_admin: manage_trainer_roster (create/edit trainer accounts).
create policy trainers_super_admin_all on trainers
  for all
  using (auth_role() = 'super_admin')
  with check (auth_role() = 'super_admin');

-- platform_admin: read-only, needed to assign a trainer at scheduling time.
create policy trainers_platform_admin_select on trainers
  for select
  using (auth_role() = 'platform_admin');

-- trainer: can see their own row.
create policy trainers_self_select on trainers
  for select
  using (auth_role() = 'trainer' and user_id = auth.uid());
