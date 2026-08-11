-- SE Contractors Cable Accessories Certification Program.
--
-- A GCC Lab program documented in cable-project/, where four courses this
-- catalog ALREADY holds — CTCT06, CTCT08, CTCT10 and CTCT12, the Power Cable
-- Joint and Termination courses at 1KV, 13.8KV, 33KV and 69KV — end in a card
-- printed by the cable-accessory manufacturer instead of a certificate this
-- platform issues.
--
-- The workflow around them is the one the platform already runs: request,
-- review, register, invoice, verify payment, schedule, attend, assess. Only
-- the last third differs:
--
--   * the assessment is a scored rubric across two practical tests (the Cable
--     Technician Evaluation form), not a single exam mark;
--   * the evaluator can belong to the manufacturer rather than to GCC Lab;
--   * the credential is a physical card the MANUFACTURER prints. This platform
--     never issues it and must never claim to — its job ends at sending the
--     pass list and recording who collected a card.
--
-- Note what this migration does NOT add: a `kind` column separating "tests"
-- from "courses". An earlier draft had one, on the assumption that only a
-- standalone test could yield a card. The source material says otherwise —
-- the PowerPoint puts the assessment "at the end of the Training course" —
-- so the two facts that actually matter are orthogonal and already expressible:
-- what a course awards (`outcome`), and how it is scored (`rubric`).

-- ---------------------------------------------------------------------------
-- What a course awards
-- ---------------------------------------------------------------------------

alter table courses add column outcome text not null default 'certificate';
alter table courses add constraint courses_outcome_check
  check (outcome in ('certificate', 'card'));

-- The scoring sheet: which practical parts are assessed, against which
-- criteria, out of what. JSON rather than four more tables because it is read
-- whole, written once per course, and never queried across rows. The pass
-- threshold is NOT in here — it stays in courses.pass_mark, so there is one
-- number rather than two that can drift apart.
alter table courses add column rubric jsonb;

-- A card is awarded on the strength of a rubric assessment. Allowing a
-- card-awarding course with no rubric would let one reach assessment day with
-- nothing to score against.
alter table courses add constraint courses_card_requires_rubric
  check (outcome = 'certificate' or rubric is not null);

comment on column courses.outcome is
  'certificate = this platform issues a PDF it stands behind; card = an external manufacturer prints the credential and we only track it.';
comment on column courses.rubric is
  'Scoring sheet: {passRule, parts[], criteria[]}. The pass threshold comes from courses.pass_mark.';

-- ---------------------------------------------------------------------------
-- Manufacturers
-- ---------------------------------------------------------------------------

create table manufacturers (
  id bigint primary key generated always as identity,
  name text not null,
  contact_name text,
  -- Nullable: a manufacturer can be on file before anyone has confirmed who
  -- receives the pass list. Dispatch refuses to send without it, rather than
  -- letting the workflow reach step 9 and stall silently.
  contact_email text,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index manufacturers_name_key on manufacturers (lower(name));

alter table manufacturers enable row level security;
grant select, insert, update, delete on manufacturers to authenticated, service_role;

-- Mirrors training_centers (0007): everyone signed in may read the list,
-- because scheduling has to name one; only super_admin maintains it.
create policy manufacturers_select_all on manufacturers
  for select using (auth.role() = 'authenticated');
create policy manufacturers_super_admin_write on manufacturers
  for all using (auth_role() = 'super_admin') with check (auth_role() = 'super_admin');

-- An evaluator may work for the manufacturer rather than for GCC Lab.
-- Existing trainers are GCC Lab's, which is what the default records.
alter table trainers add column employer_kind text not null default 'gcclab';
alter table trainers add constraint trainers_employer_kind_check
  check (employer_kind in ('gcclab', 'manufacturer'));
alter table trainers add column manufacturer_id bigint references manufacturers (id);
alter table trainers add constraint trainers_manufacturer_matches_employer
  check ((employer_kind = 'manufacturer') = (manufacturer_id is not null));

-- ---------------------------------------------------------------------------
-- Request intake: the two fields the paper form has and we don't
-- ---------------------------------------------------------------------------

-- نموذج طلب اختبار carries نوع الطلب (إصدار جديد / تجديد). A renewal matters
-- downstream: cards lapse two years after the test date, so re-testing an
-- already-carded technician is a different request from a first sitting, and
-- the card receipt form records which it was.
alter table training_requests add column issuance_type text;
alter table training_requests add constraint training_requests_issuance_type_check
  check (issuance_type is null or issuance_type in ('new', 'renewal'));

-- The same form allows a venue that is none of GCC Lab's four institutes
-- (معهد خارجي), named in free text.
alter table training_requests add column external_institute_name text;

-- ---------------------------------------------------------------------------
-- Scheduling: steps 5 and 6 of the workflow
-- ---------------------------------------------------------------------------

alter table classes add column manufacturer_id bigint references manufacturers (id);
-- Step 5. Until this is set the date is GCC Lab's proposal, not an agreed
-- one, and no candidate should be told to travel to it.
alter table classes add column manufacturer_confirmed_at timestamptz;
-- Step 6. Recorded so the guidelines are not sent twice, and so an auditor can
-- see the candidates were told what to bring before they were assessed.
alter table classes add column guidelines_sent_at timestamptz;

comment on column classes.manufacturer_confirmed_at is
  'Step 5: the manufacturer agreed this date. Before it is set, the schedule is only a proposal.';

-- ---------------------------------------------------------------------------
-- The rubric result, cell by cell
-- ---------------------------------------------------------------------------

-- One row per (part, criterion) per attempt — ten for a cable assessment.
-- Stored per cell rather than as a total because the pass rule is per item: a
-- technician can score 90% overall and still fail, and a stored total throws
-- away the only information that would show it.
create table assessment_scores (
  id bigint primary key generated always as identity,
  enrollment_id bigint not null references class_enrollments (id) on delete cascade,
  -- Matches exam_results.attempt_no so a re-test (إعادة) sits beside the first
  -- attempt instead of overwriting it.
  attempt_no integer not null default 1,
  part_code text not null,
  criterion_code text not null,
  score integer not null,
  recorded_by uuid not null,
  recorded_at timestamptz not null default now()
);

alter table assessment_scores add constraint assessment_scores_score_non_negative
  check (score >= 0);

create unique index assessment_scores_cell_key
  on assessment_scores (enrollment_id, attempt_no, part_code, criterion_code);
create index assessment_scores_enrollment_id_idx on assessment_scores (enrollment_id);

alter table assessment_scores enable row level security;
grant select, insert, update, delete on assessment_scores to authenticated, service_role;

create policy assessment_scores_platform_admin_all on assessment_scores
  for all
  using (auth_role() = 'platform_admin')
  with check (auth_role() = 'platform_admin');

create policy assessment_scores_trainer_select_own on assessment_scores
  for select
  using (
    auth_role() = 'trainer'
    and exists (
      select 1
      from class_enrollments e
      join classes c on c.id = e.class_id
      where e.id = assessment_scores.enrollment_id and c.trainer_id = auth_trainer_id()
    )
  );

-- Deliberately no contractor policy: a company sees its technician's pass or
-- fail, not the evaluator's per-criterion marking.

-- ---------------------------------------------------------------------------
-- Cards
-- ---------------------------------------------------------------------------

-- Not a `certificates` row. The public verify page's whole promise is that a
-- serial it recognises was issued BY GCC Lab; a manufacturer's card was not,
-- and filing one as a certificate would make that page lie about who stands
-- behind it. The lifecycle differs too — nothing to approve, no PDF to render,
-- only a list to send and a handover to record.
create table qualification_cards (
  id bigint primary key generated always as identity,
  employee_id bigint not null references employees (id),
  course_id bigint not null references courses (id),
  class_id bigint not null references classes (id),
  company_id bigint not null references companies (id),
  manufacturer_id bigint references manufacturers (id),
  status text not null default 'awaiting_issuer',
  issuance_type text not null default 'new',
  test_date date not null,
  -- Two years from the test date, per ارشادات حضور الاختبارات: "ومدتها عامين من
  -- تاريخ الاختبار". Set when the manufacturer reports the card issued.
  expires_at date,
  -- Comes back from the manufacturer; unknown until they print it.
  card_number text,
  -- The same gate inputs a certificate records, so an auditor can see why the
  -- card was earned without recomputing it.
  eligibility jsonb not null,
  dispatched_at timestamptz,
  issued_at timestamptz,
  collected_at timestamptz,
  -- نموذج الغياب و استلام البطاقات: who physically took the card. Often the
  -- contractor's representative rather than the technician.
  collected_by_name text,
  collected_by_mobile text,
  receipt_document_id bigint references documents (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table qualification_cards add constraint qualification_cards_status_check
  check (status in ('awaiting_issuer', 'issued', 'collected', 'expired', 'void'));
alter table qualification_cards add constraint qualification_cards_issuance_type_check
  check (issuance_type in ('new', 'renewal'));

-- The idempotency guard certificates rely on: one card per technician per
-- sitting, so re-running the gate cannot mint a second.
create unique index qualification_cards_employee_class_key
  on qualification_cards (employee_id, class_id);
create unique index qualification_cards_card_number_key
  on qualification_cards (card_number) where card_number is not null;
create index qualification_cards_company_id_idx on qualification_cards (company_id);
create index qualification_cards_class_id_idx on qualification_cards (class_id);
create index qualification_cards_status_idx on qualification_cards (status);
create index qualification_cards_expires_at_idx on qualification_cards (expires_at);

alter table qualification_cards enable row level security;
grant select, insert, update, delete on qualification_cards to authenticated, service_role;

-- Mirrors certificates (0013) exactly.
create policy qualification_cards_platform_admin_all on qualification_cards
  for all
  using (auth_role() = 'platform_admin')
  with check (auth_role() = 'platform_admin');

create policy qualification_cards_contractor_select_own on qualification_cards
  for select
  using (auth_role() = 'contractor_manager' and company_id = auth_company_id());

create policy qualification_cards_trainer_select_own on qualification_cards
  for select
  using (
    auth_role() = 'trainer'
    and exists (select 1 from classes c where c.id = qualification_cards.class_id and c.trainer_id = auth_trainer_id())
  );

-- ---------------------------------------------------------------------------
-- Dispatch record: step 9
-- ---------------------------------------------------------------------------

-- Proof of what GCC Lab told the card issuer, and when. The pass list leaves
-- the platform, so the snapshot is kept rather than recomputed: who was on the
-- list at the moment it was sent is a different question from who would be on
-- it now.
create table card_dispatches (
  id bigint primary key generated always as identity,
  class_id bigint not null references classes (id),
  manufacturer_id bigint not null references manufacturers (id),
  recipient_email text not null,
  pass_count integer not null,
  -- The full printing list, identity numbers unmasked, lives in private
  -- storage behind a signed link — never in the body of an email that would
  -- sit in a third party's mailbox forever.
  bucket text not null,
  object_key text not null,
  link_expires_at timestamptz not null,
  snapshot jsonb not null,
  sent_by uuid,
  sent_at timestamptz not null default now()
);

create index card_dispatches_class_id_idx on card_dispatches (class_id);

alter table card_dispatches enable row level security;
grant select, insert, update, delete on card_dispatches to authenticated, service_role;

create policy card_dispatches_platform_admin_all on card_dispatches
  for all
  using (auth_role() = 'platform_admin')
  with check (auth_role() = 'platform_admin');

-- ---------------------------------------------------------------------------
-- The four cable courses become card-awarding
-- ---------------------------------------------------------------------------

-- CTCT06/08/10/12 already exist, already carry regional pricing, already
-- restrict to the matching Cable Joint & Termination Technician job role, and
-- already require CSCC02 Safe Working Procedures for Electrical. None of that
-- changes. What changes is what they award and how they are scored.
--
-- pass_mark 70 is the threshold the rubric applies PER CRITERION — the
-- evaluation form grants a card only to a technician scoring "70% or above in
-- each evaluation item". Someone who fails the insulation test outright but
-- excels elsewhere still clears 70% overall, and must not be carded.
update courses set
  outcome = 'card',
  exam_required = true,
  pass_mark = 70,
  validity_months = 24,
  rubric = jsonb_build_object(
    'passRule', 'per_item',
    'parts', jsonb_build_array(
      jsonb_build_object('code', 'splicing',    'en', 'Splicing Test',    'ar', 'اختبار الوصل'),
      jsonb_build_object('code', 'termination', 'en', 'Termination Test', 'ar', 'اختبار النهايات')
    ),
    'criteria', jsonb_build_array(
      jsonb_build_object('code', 'safety',      'max', 20, 'en', 'Safety terms',                    'ar', 'اشتراطات السلامة'),
      jsonb_build_object('code', 'preparation', 'max', 20, 'en', 'Cable preparation',               'ar', 'تجهيز الكابل'),
      jsonb_build_object('code', 'assembly',    'max', 20, 'en', 'Assembly of joint / termination', 'ar', 'تركيب الوصلة / النهاية'),
      jsonb_build_object('code', 'skills',      'max', 20, 'en', 'Technician skills',               'ar', 'مهارات الفني'),
      jsonb_build_object('code', 'insulation',  'max', 20, 'en', 'Insulation test',                 'ar', 'اختبار العزل')
    )
  )
where code in ('CTCT06', 'CTCT08', 'CTCT10', 'CTCT12');

-- NOTE — entry requirements are deliberately NOT changed here.
--
-- GCC Lab's rule is that a technician must hold FOUR certificates, uploaded by
-- the contractor and verified by an admin, before being registered for one of
-- these. The platform enforces exactly that already: assertCourseFitsEmployees()
-- refuses a submission on unmet prerequisites, and a verified external
-- `prior_certificate` document satisfies the gate identically to an
-- internally-issued one.
--
-- Today these four courses require CSCC00 (OHS General Induction, applied to
-- every course) plus CSCC02 — two, not four. The remaining two are named in
-- ضوابط التأهيل لفني الكابلات, which is not among the supplied documents.
-- Adding rows to course_prerequisites is a one-line change once they are
-- confirmed; guessing at them would refuse legitimate technicians.
