-- 1:1 with auth.users. The Phase 2 auth hook copies role/company_id/trainer_id
-- from here into the JWT's custom "user_role"/"company_id"/"trainer_id"
-- claims at token issuance.
create table profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('super_admin', 'platform_admin', 'contractor_manager', 'trainer')),
  company_id bigint references companies (id) on delete restrict,
  trainer_id bigint references trainers (id) on delete restrict,
  full_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_company_id_only_for_contractor check (
    (role = 'contractor_manager' and company_id is not null) or
    (role <> 'contractor_manager' and company_id is null)
  ),
  constraint profiles_trainer_id_only_for_trainer check (
    (role = 'trainer' and trainer_id is not null) or
    (role <> 'trainer' and trainer_id is null)
  )
);

create index profiles_company_id_idx on profiles (company_id);
create index profiles_trainer_id_idx on profiles (trainer_id);
create index profiles_role_idx on profiles (role);

alter table profiles enable row level security;

grant select, insert, update, delete on profiles to authenticated, service_role;

-- Every authenticated user can read their own profile row.
create policy profiles_self_select on profiles
  for select
  using (user_id = auth.uid());

-- super_admin: manage_users (create/edit admin + trainer accounts directly).
create policy profiles_super_admin_all on profiles
  for all
  using (auth_role() = 'super_admin')
  with check (auth_role() = 'super_admin');

-- No INSERT policy beyond super_admin's: account creation (incl. contractor
-- self-registration) is a server-side action using elevated privileges
-- (Phase 2), since a brand-new user has no role claim yet to check against.
