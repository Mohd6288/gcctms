-- A class reaching capacity moves further enrollments to a FIFO waitlist
-- instead of rejecting outright; a later cancellation/capacity-increase
-- promotes off the waitlist (application logic, Phase 6).
create table class_enrollments (
  id bigint generated always as identity primary key,
  class_id bigint not null references classes (id) on delete restrict,
  request_item_id bigint not null references request_items (id) on delete restrict,
  employee_id bigint not null references employees (id) on delete restrict,
  company_id bigint not null references companies (id) on delete restrict,
  status text not null default 'waitlisted' check (status in ('waitlisted', 'enrolled', 'attended_complete', 'no_show', 'withdrawn')),
  attendance_pct numeric(5, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_enrollments_class_employee_key unique (class_id, employee_id)
);

create index class_enrollments_class_id_idx on class_enrollments (class_id);
create index class_enrollments_employee_id_idx on class_enrollments (employee_id);
create index class_enrollments_company_id_idx on class_enrollments (company_id);

-- Site policy: mark present = false for a session attended without required
-- safety attire — non-compliant attendance counts as absence toward the 10%
-- cap, it does not get a separate status.
create table attendance (
  id bigint generated always as identity primary key,
  class_id bigint not null references classes (id) on delete restrict,
  session_date date not null,
  employee_id bigint not null references employees (id) on delete restrict,
  present boolean not null,
  recorded_by uuid not null references auth.users (id) on delete restrict,
  recorded_at timestamptz not null default now(),
  constraint attendance_class_session_employee_key unique (class_id, session_date, employee_id)
);

create index attendance_class_id_idx on attendance (class_id);
create index attendance_employee_id_idx on attendance (employee_id);

create table exam_results (
  id bigint generated always as identity primary key,
  enrollment_id bigint not null references class_enrollments (id) on delete restrict,
  exam_id bigint not null references exams (id) on delete restrict,
  score int not null,
  result text not null check (result in ('pass', 'fail')),
  attempt_no int not null default 1,
  recorded_by uuid not null references auth.users (id) on delete restrict,
  recorded_at timestamptz not null default now(),
  constraint exam_results_enrollment_attempt_key unique (enrollment_id, attempt_no)
);

create index exam_results_enrollment_id_idx on exam_results (enrollment_id);

alter table class_enrollments enable row level security;
alter table attendance enable row level security;
alter table exam_results enable row level security;

grant select, insert, update, delete on class_enrollments to authenticated, service_role;
grant select, insert, update, delete on attendance to authenticated, service_role;
grant select, insert, update, delete on exam_results to authenticated, service_role;

create policy class_enrollments_platform_admin_all on class_enrollments
  for all
  using (auth_role() = 'platform_admin')
  with check (auth_role() = 'platform_admin');

create policy class_enrollments_trainer_select_own on class_enrollments
  for select
  using (
    auth_role() = 'trainer'
    and exists (select 1 from classes c where c.id = class_enrollments.class_id and c.trainer_id = auth_trainer_id())
  );

create policy class_enrollments_contractor_select_own on class_enrollments
  for select
  using (auth_role() = 'contractor_manager' and company_id = auth_company_id());

create policy attendance_platform_admin_all on attendance
  for all
  using (auth_role() = 'platform_admin')
  with check (auth_role() = 'platform_admin');

-- Trainer writes are gated to their own classes while in_progress.
create policy attendance_trainer_select_own on attendance
  for select
  using (
    auth_role() = 'trainer'
    and exists (select 1 from classes c where c.id = attendance.class_id and c.trainer_id = auth_trainer_id())
  );

create policy attendance_trainer_write_own on attendance
  for insert
  with check (
    auth_role() = 'trainer'
    and exists (
      select 1 from classes c
      where c.id = attendance.class_id and c.trainer_id = auth_trainer_id() and c.status = 'in_progress'
    )
  );

create policy attendance_trainer_update_own on attendance
  for update
  using (
    auth_role() = 'trainer'
    and exists (
      select 1 from classes c
      where c.id = attendance.class_id and c.trainer_id = auth_trainer_id() and c.status = 'in_progress'
    )
  )
  with check (
    auth_role() = 'trainer'
    and exists (
      select 1 from classes c
      where c.id = attendance.class_id and c.trainer_id = auth_trainer_id() and c.status = 'in_progress'
    )
  );

create policy exam_results_platform_admin_all on exam_results
  for all
  using (auth_role() = 'platform_admin')
  with check (auth_role() = 'platform_admin');

create policy exam_results_trainer_select_own on exam_results
  for select
  using (
    auth_role() = 'trainer'
    and exists (
      select 1 from class_enrollments ce join classes c on c.id = ce.class_id
      where ce.id = exam_results.enrollment_id and c.trainer_id = auth_trainer_id()
    )
  );

create policy exam_results_trainer_write_own on exam_results
  for insert
  with check (
    auth_role() = 'trainer'
    and exists (
      select 1 from class_enrollments ce join classes c on c.id = ce.class_id
      where ce.id = exam_results.enrollment_id and c.trainer_id = auth_trainer_id() and c.status = 'in_progress'
    )
  );

create policy exam_results_trainer_update_own on exam_results
  for update
  using (
    auth_role() = 'trainer'
    and exists (
      select 1 from class_enrollments ce join classes c on c.id = ce.class_id
      where ce.id = exam_results.enrollment_id and c.trainer_id = auth_trainer_id() and c.status = 'in_progress'
    )
  )
  with check (
    auth_role() = 'trainer'
    and exists (
      select 1 from class_enrollments ce join classes c on c.id = ce.class_id
      where ce.id = exam_results.enrollment_id and c.trainer_id = auth_trainer_id() and c.status = 'in_progress'
    )
  );

-- Deferred from 0006_employees.sql: trainer visibility via class roster join.
create policy employees_trainer_select_via_roster on employees
  for select
  using (
    auth_role() = 'trainer'
    and exists (
      select 1 from class_enrollments ce join classes c on c.id = ce.class_id
      where ce.employee_id = employees.id and c.trainer_id = auth_trainer_id()
    )
  );
