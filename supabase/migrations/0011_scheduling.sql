-- btree_gist backs the trainer-double-booking EXCLUDE constraint below —
-- enforcing "no admin/app forgets this" at the database, not just detecting
-- it in application code as the validated prototype did.
create extension if not exists btree_gist;

create table classes (
  id bigint generated always as identity primary key,
  course_id bigint not null references courses (id) on delete restrict,
  trainer_id bigint not null references trainers (id) on delete restrict,
  center_id bigint references training_centers (id) on delete restrict,
  region text not null check (region in ('North', 'South', 'East', 'West', 'Central')),
  type text not null check (type in ('private', 'public')),
  company_id bigint references companies (id) on delete restrict,
  start_date date not null,
  end_date date not null,
  sessions jsonb not null default '[]'::jsonb,
  capacity int not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'in_progress', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint classes_private_requires_company check (
    (type = 'private' and company_id is not null) or (type = 'public')
  ),
  constraint classes_date_range check (end_date >= start_date)
);

create index classes_trainer_id_idx on classes (trainer_id);
create index classes_company_id_idx on classes (company_id);
create index classes_status_idx on classes (status);

-- A trainer cannot be double-booked: no two non-cancelled classes for the
-- same trainer may have overlapping [start_date, end_date] ranges.
alter table classes add constraint classes_trainer_no_overlap
  exclude using gist (
    trainer_id with =,
    daterange(start_date, end_date, '[]') with &&
  ) where (status <> 'cancelled');

-- At most one platform_admin assigned per region at a time; overwriting
-- the row for a region reassigns it.
create table regional_admin_assignments (
  region text primary key check (region in ('North', 'South', 'East', 'West', 'Central')),
  admin_user_id uuid references auth.users (id) on delete restrict,
  assigned_at timestamptz not null default now()
);

alter table classes enable row level security;
alter table regional_admin_assignments enable row level security;

grant select, insert, update, delete on classes to authenticated, service_role;
grant select, insert, update, delete on regional_admin_assignments to authenticated, service_role;

create policy classes_platform_admin_all on classes
  for all
  using (auth_role() = 'platform_admin')
  with check (auth_role() = 'platform_admin');

create policy classes_trainer_select_own on classes
  for select
  using (auth_role() = 'trainer' and trainer_id = auth_trainer_id());

create policy regional_admin_assignments_super_admin_all on regional_admin_assignments
  for all
  using (auth_role() = 'super_admin')
  with check (auth_role() = 'super_admin');

create policy regional_admin_assignments_platform_admin_select on regional_admin_assignments
  for select
  using (auth_role() = 'platform_admin');
