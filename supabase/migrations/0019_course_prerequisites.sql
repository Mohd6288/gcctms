-- Course prerequisites — OR-semantics: an employee satisfies a course's
-- prerequisite gate by holding a valid (issued, non-expired) certificate for
-- ANY ONE of the listed prerequisite courses, not all of them. A course with
-- zero rows here has no prerequisite gate. See roles-and-workflows.md.
create table course_prerequisites (
  id bigint generated always as identity primary key,
  course_id bigint not null references courses (id) on delete restrict,
  prerequisite_course_id bigint not null references courses (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint course_prerequisites_pair_key unique (course_id, prerequisite_course_id),
  constraint course_prerequisites_not_self check (course_id <> prerequisite_course_id)
);

create index course_prerequisites_prerequisite_course_id_idx on course_prerequisites (prerequisite_course_id);

alter table course_prerequisites enable row level security;

grant select, insert, update, delete on course_prerequisites to authenticated, service_role;

-- Same pattern as course_job_roles: readable by every authenticated role,
-- writable only by super_admin (manage_catalog).
create policy course_prerequisites_select_all on course_prerequisites for select using (auth.role() = 'authenticated');
create policy course_prerequisites_super_admin_write on course_prerequisites for all
  using (auth_role() = 'super_admin') with check (auth_role() = 'super_admin');
