create table exams (
  id bigint generated always as identity primary key,
  code text not null unique,
  title text not null,
  pass_mark int not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- code follows GCC Lab's real convention: CSCC + 2-digit sequence
-- (e.g. CSCC00 OHS General Induction, CSCC14 Work Permit – Sender & Receiver).
create table courses (
  id bigint generated always as identity primary key,
  code text not null unique,
  title_en text not null,
  title_ar text not null,
  description text,
  duration_hours numeric(5, 2) not null,
  min_attendance_pct int not null default 90,
  exam_id bigint references exams (id) on delete restrict,
  validity_months int,
  -- Matches the validated prototype's Course.contractorCategory exactly:
  -- null = universal course (shown to every company); set = only shown to
  -- companies with that exact category. See requests/queries.ts's
  -- listActiveCourses().
  contractor_category text check (contractor_category is null or contractor_category in ('Distribution', 'Transmission')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index courses_exam_id_idx on courses (exam_id);

create table course_job_roles (
  id bigint generated always as identity primary key,
  course_id bigint not null references courses (id) on delete restrict,
  job_role_id bigint not null references job_roles (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint course_job_roles_pair_key unique (course_id, job_role_id)
);

create index course_job_roles_job_role_id_idx on course_job_roles (job_role_id);

create table training_centers (
  id bigint generated always as identity primary key,
  name text not null,
  city text,
  address text,
  capacity int,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- region: null = default price for the course; a region-specific row
-- overrides it for that region only (resolved at read time in application code).
create table pricing (
  id bigint generated always as identity primary key,
  course_id bigint not null references courses (id) on delete restrict,
  region text check (region is null or region in ('North', 'South', 'East', 'West', 'Central')),
  price numeric(10, 2) not null,
  currency text not null default 'SAR',
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pricing_course_region_effective_from_key unique (course_id, region, effective_from)
);

create index pricing_course_id_idx on pricing (course_id);

alter table exams enable row level security;
alter table courses enable row level security;
alter table course_job_roles enable row level security;
alter table training_centers enable row level security;
alter table pricing enable row level security;

grant select, insert, update, delete on exams to authenticated, service_role;
grant select, insert, update, delete on courses to authenticated, service_role;
grant select, insert, update, delete on course_job_roles to authenticated, service_role;
grant select, insert, update, delete on training_centers to authenticated, service_role;
grant select, insert, update, delete on pricing to authenticated, service_role;

-- Catalog tables: readable by every authenticated role, writable only by
-- super_admin (manage_catalog is super_admin-only per roles-and-workflows.md).
create policy exams_select_all on exams for select using (auth.role() = 'authenticated');
create policy exams_super_admin_write on exams for all
  using (auth_role() = 'super_admin') with check (auth_role() = 'super_admin');

create policy courses_select_all on courses for select using (auth.role() = 'authenticated');
create policy courses_super_admin_write on courses for all
  using (auth_role() = 'super_admin') with check (auth_role() = 'super_admin');

create policy course_job_roles_select_all on course_job_roles for select using (auth.role() = 'authenticated');
create policy course_job_roles_super_admin_write on course_job_roles for all
  using (auth_role() = 'super_admin') with check (auth_role() = 'super_admin');

create policy training_centers_select_all on training_centers for select using (auth.role() = 'authenticated');
create policy training_centers_super_admin_write on training_centers for all
  using (auth_role() = 'super_admin') with check (auth_role() = 'super_admin');

-- pricing: admin-only for ALL commands — contractors never see pricing rows,
-- only the computed total on their request (see training_requests below).
create policy pricing_super_admin_all on pricing for all
  using (auth_role() = 'super_admin') with check (auth_role() = 'super_admin');

create policy pricing_platform_admin_select on pricing for select
  using (auth_role() = 'platform_admin');
