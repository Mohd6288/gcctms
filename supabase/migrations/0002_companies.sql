create table companies (
  id bigint generated always as identity primary key,
  name text not null,
  cr_number text not null unique,
  vat_number text,
  contact_name text not null,
  contact_email text not null,
  contact_phone text not null,
  city text,
  address text,
  -- sector/region/contractor_category: match the validated prototype's
  -- Company type exactly. region feeds regional pricing suggestions;
  -- contractor_category (optional) filters the course list in the request
  -- wizard and the job-role list in the employee form — see
  -- requests/queries.ts's listActiveCourses() and employees/queries.ts's
  -- listActiveJobRoles().
  sector text,
  region text check (region is null or region in ('North', 'South', 'East', 'West', 'Central')),
  contractor_category text check (contractor_category is null or contractor_category in ('Distribution', 'Transmission')),
  owner_user_id uuid not null references auth.users (id) on delete restrict,
  status text not null default 'active' check (status in ('pending', 'active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index companies_owner_user_id_idx on companies (owner_user_id);
create index companies_status_idx on companies (status);

alter table companies enable row level security;

-- Table-level GRANT is the coarse gate PostgREST/supabase-js checks first;
-- RLS policies above are the fine-grained per-row gate. Both are required —
-- without this grant, 'authenticated' can query the table at all.
grant select, insert, update, delete on companies to authenticated, service_role;

-- platform_admin: full operational access.
create policy companies_platform_admin_all on companies
  for all
  using (auth_role() = 'platform_admin')
  with check (auth_role() = 'platform_admin');

-- contractor_manager: sees and edits only their own company's profile.
create policy companies_contractor_select_own on companies
  for select
  using (auth_role() = 'contractor_manager' and id = auth_company_id());

create policy companies_contractor_update_own on companies
  for update
  using (auth_role() = 'contractor_manager' and id = auth_company_id())
  with check (auth_role() = 'contractor_manager' and id = auth_company_id());

-- No INSERT policy for 'authenticated': company registration is a
-- server-side action (Phase 2) run with elevated privileges, since the
-- registering user has no company_id claim yet.
-- No super_admin policy: per roles-and-workflows.md, super_admin's blanket
-- RLS access is scoped to catalog/pricing tables only, not companies.
