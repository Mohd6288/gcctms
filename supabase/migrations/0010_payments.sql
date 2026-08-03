-- Plays the role of "the invoice" too (validated prototype's single-entity
-- Invoice: one line item = course x billable employee count).
create table payments (
  id bigint generated always as identity primary key,
  request_id bigint not null references training_requests (id) on delete restrict,
  sadad_invoice_ref text,
  description text not null,
  qty int not null,
  unit_price numeric(10, 2) not null,
  subtotal numeric(10, 2) generated always as (qty * unit_price) stored,
  vat_rate numeric(4, 3) not null default 0.15,
  total_amount numeric(10, 2) generated always as (qty * unit_price * (1 + vat_rate)) stored,
  document_id bigint references documents (id) on delete restrict,
  status text not null default 'uploaded' check (status in ('uploaded', 'verified', 'rejected')),
  verified_by uuid references auth.users (id) on delete restrict,
  verified_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payments_request_id_idx on payments (request_id);
create index payments_status_idx on payments (status);

alter table payments enable row level security;

grant select, insert, update, delete on payments to authenticated, service_role;

-- platform_admin: full access (verify_payments capability).
create policy payments_platform_admin_all on payments
  for all
  using (auth_role() = 'platform_admin')
  with check (auth_role() = 'platform_admin');

create policy payments_contractor_select_own on payments
  for select
  using (
    auth_role() = 'contractor_manager'
    and exists (
      select 1 from training_requests tr
      where tr.id = payments.request_id and tr.company_id = auth_company_id()
    )
  );

-- Contractor is insert-only (upload_payment capability) — no UPDATE policy,
-- so a contractor can never set their own verified status.
create policy payments_contractor_insert_own on payments
  for insert
  with check (
    auth_role() = 'contractor_manager'
    and exists (
      select 1 from training_requests tr
      where tr.id = payments.request_id and tr.company_id = auth_company_id()
    )
  );

-- No super_admin policy: blanket RLS access stays scoped to catalog/pricing.
