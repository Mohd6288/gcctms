-- national_id_enc/national_id_hash: Iqama (residency ID) only, application-level
-- AES-256-GCM encryption + HMAC-SHA256 hash (see src/modules/platform/security),
-- key from NATIONAL_ID_HASH_KEY env var. The DB never sees the plaintext.
create table employees (
  id bigint generated always as identity primary key,
  company_id bigint not null references companies (id) on delete restrict,
  full_name_en text not null,
  full_name_ar text not null,
  national_id_enc bytea not null,
  national_id_hash text not null,
  job_role_id bigint not null references job_roles (id) on delete restrict,
  email text,
  phone text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Global uniqueness (not scoped to company_id): one Iqama belongs to
  -- exactly one employee record system-wide, per roles-and-workflows.md.
  constraint employees_national_id_hash_key unique (national_id_hash)
);

create index employees_company_id_idx on employees (company_id);
create index employees_job_role_id_idx on employees (job_role_id);
create index employees_status_idx on employees (status);

alter table employees enable row level security;

grant select, insert, update, delete on employees to authenticated, service_role;

-- platform_admin: full operational access.
create policy employees_platform_admin_all on employees
  for all
  using (auth_role() = 'platform_admin')
  with check (auth_role() = 'platform_admin');

-- contractor_manager: own company's roster only.
create policy employees_contractor_select_own on employees
  for select
  using (auth_role() = 'contractor_manager' and company_id = auth_company_id());

create policy employees_contractor_insert_own on employees
  for insert
  with check (auth_role() = 'contractor_manager' and company_id = auth_company_id());

create policy employees_contractor_update_own on employees
  for update
  using (auth_role() = 'contractor_manager' and company_id = auth_company_id())
  with check (auth_role() = 'contractor_manager' and company_id = auth_company_id());

-- Trainer visibility (via class roster join) is added once class_enrollments
-- exists — see 0012_delivery.sql.
-- No super_admin policy: blanket RLS access stays scoped to catalog/pricing.
