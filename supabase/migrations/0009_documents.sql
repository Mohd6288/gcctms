-- registration_sheet/hrbl_request_form are the two real GCC Lab request
-- forms, request-scoped and both required before a request can be approved
-- (see training_requests migration's status check + roles-and-workflows.md's
-- state machine). Other types are employee-scoped (request_id null).
create table documents (
  id bigint generated always as identity primary key,
  company_id bigint not null references companies (id) on delete restrict,
  employee_id bigint references employees (id) on delete restrict,
  request_id bigint references training_requests (id) on delete restrict,
  type text not null check (type in (
    'national_id', 'prior_certificate', 'sadad_invoice', 'generated_certificate',
    'registration_sheet', 'hrbl_request_form', 'other'
  )),
  bucket text not null,
  object_key text not null unique,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  checksum_sha256 text not null,
  uploaded_by uuid not null references auth.users (id) on delete restrict,
  verified_by uuid references auth.users (id) on delete restrict,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index documents_request_type_key on documents (request_id, type) where request_id is not null;
create index documents_company_id_idx on documents (company_id);
create index documents_employee_id_idx on documents (employee_id);
create index documents_request_id_idx on documents (request_id);

-- Only platform_admin's own UPDATE (verifying a request-level document) may
-- set verified_by/verified_at; any other actor's UPDATE (e.g. a contractor
-- replacing a file) clears them back to null, matching the
-- re-upload-resets-verification behavior in database-schema.md.
create or replace function documents_protect_verification_columns() returns trigger
language plpgsql
as $$
begin
  if auth_role() <> 'platform_admin' then
    new.verified_by := null;
    new.verified_at := null;
  end if;
  return new;
end;
$$;

create trigger documents_protect_verification_columns_trg
  before update on documents
  for each row
  execute function documents_protect_verification_columns();

alter table documents enable row level security;

grant select, insert, update, delete on documents to authenticated, service_role;

-- platform_admin: full access, incl. setting verified_by/verified_at.
create policy documents_platform_admin_all on documents
  for all
  using (auth_role() = 'platform_admin')
  with check (auth_role() = 'platform_admin');

create policy documents_contractor_select_own on documents
  for select
  using (auth_role() = 'contractor_manager' and company_id = auth_company_id());

create policy documents_contractor_insert_own on documents
  for insert
  with check (
    auth_role() = 'contractor_manager' and company_id = auth_company_id()
    and (
      request_id is null
      or exists (
        select 1 from training_requests tr
        where tr.id = documents.request_id and tr.company_id = auth_company_id()
          and tr.status in ('draft', 'submitted', 'info_requested')
      )
    )
  );

-- Contractor UPDATE = replacing the file at the same slot; the trigger above
-- forces verified_by/verified_at back to null on any such update.
create policy documents_contractor_update_own on documents
  for update
  using (
    auth_role() = 'contractor_manager' and company_id = auth_company_id()
    and (
      request_id is null
      or exists (
        select 1 from training_requests tr
        where tr.id = documents.request_id and tr.company_id = auth_company_id()
          and tr.status in ('draft', 'submitted', 'info_requested')
      )
    )
  )
  with check (auth_role() = 'contractor_manager' and company_id = auth_company_id());

-- No super_admin policy: blanket RLS access stays scoped to catalog/pricing.
