-- serial: GCCLAB-{course.code}-{YYYYMMDD}-{4-digit random}, server-generated
-- at issuance (application code, Phase 8) — not derived here.
-- expires_at = issued_at + 730 days (2 years), set at issuance, not computed
-- on read.
create table certificates (
  id bigint generated always as identity primary key,
  employee_id bigint not null references employees (id) on delete restrict,
  course_id bigint not null references courses (id) on delete restrict,
  class_id bigint not null references classes (id) on delete restrict,
  company_id bigint not null references companies (id) on delete restrict,
  serial text unique,
  status text not null default 'pending_approval' check (status in ('pending_approval', 'issued', 'rejected', 'revoked')),
  eligibility jsonb not null,
  approved_by uuid references auth.users (id) on delete restrict,
  approved_at timestamptz,
  issued_at timestamptz,
  expires_at timestamptz,
  pdf_object_key text,
  revoked_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index certificates_employee_id_idx on certificates (employee_id);
create index certificates_company_id_idx on certificates (company_id);
create index certificates_class_id_idx on certificates (class_id);
create index certificates_status_idx on certificates (status);

alter table certificates enable row level security;

grant select, insert, update, delete on certificates to authenticated, service_role;

create policy certificates_platform_admin_all on certificates
  for all
  using (auth_role() = 'platform_admin')
  with check (auth_role() = 'platform_admin');

create policy certificates_contractor_select_own on certificates
  for select
  using (auth_role() = 'contractor_manager' and company_id = auth_company_id());

create policy certificates_trainer_select_own on certificates
  for select
  using (
    auth_role() = 'trainer'
    and exists (select 1 from classes c where c.id = certificates.class_id and c.trainer_id = auth_trainer_id())
  );
