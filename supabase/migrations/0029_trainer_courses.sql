-- Which courses a trainer is actually qualified to deliver. Until now the
-- only place for this was trainers.qualifications, a free-text field nothing
-- can act on — so the scheduling board would happily assign anyone to
-- anything, while employees are gated on job role and prerequisites.
create table trainer_courses (
  trainer_id bigint not null references trainers (id) on delete cascade,
  course_id bigint not null references courses (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (trainer_id, course_id)
);

create index trainer_courses_course_id_idx on trainer_courses (course_id);

alter table trainer_courses enable row level security;

grant select, insert, update, delete on trainer_courses to authenticated, service_role;

-- Mirrors trainers' own policies exactly (0004_trainers.sql): super_admin
-- owns the roster, platform_admin reads it to assign a trainer at scheduling
-- time, a trainer sees their own.
create policy trainer_courses_super_admin_all on trainer_courses
  for all
  using (auth_role() = 'super_admin')
  with check (auth_role() = 'super_admin');

create policy trainer_courses_platform_admin_select on trainer_courses
  for select
  using (auth_role() = 'platform_admin');

create policy trainer_courses_self_select on trainer_courses
  for select
  using (
    auth_role() = 'trainer'
    and exists (select 1 from trainers t where t.id = trainer_courses.trainer_id and t.user_id = auth.uid())
  );

-- A trainer can now exist on the roster before they have a login. The 13
-- profiles in files_TMS/tainers.xlsx are real people who need to be
-- schedulable now; provisioning a Supabase auth account each (with the temp
-- password createTrainer() generates, and the MFA enrolment trainers
-- require) is a separate onboarding step, not a precondition for recording
-- who they are. Postgres allows many NULLs under a unique constraint, so
-- the existing uniqueness on a real user_id still holds.
alter table trainers alter column user_id drop not null;

-- The workbook carries a mobile and an email per trainer and the table had
-- nowhere to put either — email lived only on auth.users, which a
-- login-less trainer doesn't have. Both are needed to create that login
-- later, and to contact a trainer about a class.
alter table trainers add column email text;
alter table trainers add column phone text;

create unique index trainers_email_key on trainers (lower(email)) where email is not null;
