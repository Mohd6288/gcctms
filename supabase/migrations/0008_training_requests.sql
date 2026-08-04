-- One course per request (multiple employees, single course), per the
-- validated prototype. preferred_start_date/preferred_end_date are a
-- strictly non-binding hint — real dates are set at scheduling (classes.*)
-- and never read as authoritative here.
create table training_requests (
  id bigint generated always as identity primary key,
  company_id bigint not null references companies (id) on delete restrict,
  requested_by uuid not null references auth.users (id) on delete restrict,
  course_id bigint not null references courses (id) on delete restrict,
  preferred_region text check (preferred_region is null or preferred_region in ('North', 'South', 'East', 'West', 'Central')),
  preferred_city text,
  preferred_training_type text check (preferred_training_type is null or preferred_training_type in ('on_site', 'training_center', 'virtual_theory_onsite_practical')),
  preferred_start_date date,
  preferred_end_date date,
  notes text,
  -- Exactly the validated prototype's RequestStatus set (types/index.ts) —
  -- no 'approved' (submitted -> payment_pending is a single direct step,
  -- not a persisted intermediate state), no 'cancelled' (the prototype
  -- never cancels a request, only classes), no 'closed' (closing is just
  -- setting closed_at while status stays 'completed', not its own status).
  status text not null default 'draft' check (status in (
    'draft', 'submitted', 'info_requested', 'rejected',
    'payment_pending', 'ready_for_scheduling', 'scheduled', 'completed'
  )),
  total_amount numeric(10, 2),
  admin_note text,
  rejected_reason text,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index training_requests_company_id_idx on training_requests (company_id);
create index training_requests_course_id_idx on training_requests (course_id);
create index training_requests_status_idx on training_requests (status);

-- decision: platform_admin's per-employee review call, independent of
-- status (which tracks enrollment/delivery progress).
create table request_items (
  id bigint generated always as identity primary key,
  request_id bigint not null references training_requests (id) on delete restrict,
  employee_id bigint not null references employees (id) on delete restrict,
  course_id bigint not null references courses (id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'enrolled', 'completed', 'failed', 'withdrawn')),
  decision text not null default 'pending' check (decision in ('pending', 'approved', 'rejected')),
  decision_reason text,
  decided_by uuid references auth.users (id) on delete restrict,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint request_items_request_employee_course_key unique (request_id, employee_id, course_id)
);

create index request_items_request_id_idx on request_items (request_id);
create index request_items_employee_id_idx on request_items (employee_id);
create index request_items_status_idx on request_items (status);

alter table training_requests enable row level security;
alter table request_items enable row level security;

grant select, insert, update, delete on training_requests to authenticated, service_role;
grant select, insert, update, delete on request_items to authenticated, service_role;

-- platform_admin: full operational access.
create policy training_requests_platform_admin_all on training_requests
  for all
  using (auth_role() = 'platform_admin')
  with check (auth_role() = 'platform_admin');

-- contractor_manager: own company's requests; writes limited to states
-- where the wizard/detail page still lets them edit.
create policy training_requests_contractor_select_own on training_requests
  for select
  using (auth_role() = 'contractor_manager' and company_id = auth_company_id());

create policy training_requests_contractor_insert_own on training_requests
  for insert
  with check (auth_role() = 'contractor_manager' and company_id = auth_company_id());

create policy training_requests_contractor_update_own on training_requests
  for update
  using (
    auth_role() = 'contractor_manager' and company_id = auth_company_id()
    and status in ('draft', 'submitted', 'info_requested')
  )
  with check (
    auth_role() = 'contractor_manager' and company_id = auth_company_id()
  );

create policy request_items_platform_admin_all on request_items
  for all
  using (auth_role() = 'platform_admin')
  with check (auth_role() = 'platform_admin');

create policy request_items_contractor_select_own on request_items
  for select
  using (
    auth_role() = 'contractor_manager'
    and exists (
      select 1 from training_requests tr
      where tr.id = request_items.request_id and tr.company_id = auth_company_id()
    )
  );

create policy request_items_contractor_insert_own on request_items
  for insert
  with check (
    auth_role() = 'contractor_manager'
    and exists (
      select 1 from training_requests tr
      where tr.id = request_items.request_id and tr.company_id = auth_company_id()
        and tr.status in ('draft', 'submitted', 'info_requested')
    )
  );

create policy request_items_contractor_update_own on request_items
  for update
  using (
    auth_role() = 'contractor_manager'
    and exists (
      select 1 from training_requests tr
      where tr.id = request_items.request_id and tr.company_id = auth_company_id()
        and tr.status in ('draft', 'submitted', 'info_requested')
    )
  )
  with check (
    auth_role() = 'contractor_manager'
    and exists (
      select 1 from training_requests tr
      where tr.id = request_items.request_id and tr.company_id = auth_company_id()
    )
  );

-- No super_admin policy on either table: blanket RLS access stays scoped
-- to catalog/pricing, not requests.
