-- External certificates: a certificate an employee already holds, earned
-- outside this platform (a paper OHS General Induction card, a certificate
-- issued before this system existed). Before this migration a
-- prior_certificate was an opaque file with no course link and no validity
-- dates, so the prerequisite gate — which reads the internal certificates
-- table only — could never see it. An employee genuinely holding CSCC00 was
-- therefore permanently unable to book any other course.
alter table documents add column course_id bigint references courses (id) on delete restrict;
alter table documents add column issued_at date;
alter table documents add column expires_at date;

-- Only a prior_certificate carries course/validity metadata, and once it
-- names a course it must also say when it expires — the gate compares
-- against expires_at, and a null there would read as "never valid" rather
-- than the "valid forever" a contractor would assume.
alter table documents add constraint documents_external_cert_shape
  check (
    (course_id is null and issued_at is null and expires_at is null)
    or (type = 'prior_certificate' and course_id is not null and expires_at is not null)
  );

create index documents_external_cert_idx on documents (employee_id, course_id)
  where type = 'prior_certificate' and course_id is not null;

-- One live external certificate per (employee, course): re-uploading
-- replaces it in place and drops verification, same as the request-scoped
-- slots, rather than leaving a verified row next to a newer unverified one.
create unique index documents_employee_course_cert_key on documents (employee_id, course_id)
  where type = 'prior_certificate' and course_id is not null;

-- documents_protect_verification_columns_trg was BEFORE UPDATE only, so a
-- contractor with the anon key could INSERT a row with verified_at already
-- set. That was inert while nothing read verified_at for authorization —
-- but a verified prior_certificate now satisfies a prerequisite, which would
-- let a contractor self-verify their own OHS certificate and skip the gate
-- entirely. Cover INSERT with the same function.
drop trigger if exists documents_protect_verification_columns_trg on documents;
create trigger documents_protect_verification_columns_trg
  before insert or update on documents
  for each row
  execute function documents_protect_verification_columns();
