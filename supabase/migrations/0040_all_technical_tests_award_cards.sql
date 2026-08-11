-- Every technical certification test awards a card, not only the cable ones.
--
-- ارشادات حضور المقاولين اختبارات التأهيل الفنية is written for technical
-- certification tests generally, and says so plainly: "تمنح بطاقة اجتياز لمن
-- يجتاز الاختبار بنسبة 70% فأعلى ومدتها عامين من تاريخ الاختبار" — a passing
-- card at 70% or above, valid two years. GCC Lab has now confirmed the full
-- list is CTCT01–CTCT22, of which only the six cable tests are priced so far.
--
-- Three things follow.

-- ---------------------------------------------------------------------------
-- 1. A card-awarding test may exist before its evaluation form does
-- ---------------------------------------------------------------------------

-- 0038 required a rubric on any card-awarding course, reasoning that a card is
-- earned by a scored assessment. True — but it made the rubric a condition of
-- the course EXISTING, when it is really a condition of the course being
-- ASSESSED. GCC Lab has fourteen tests and one evaluation form; the other
-- thirteen forms arrive later. Refusing to record a test until its scoring
-- sheet is in hand would keep it out of the catalog, out of the price list and
-- out of every report, which helps nobody.
--
-- The requirement moves to the point where it bites: recordAssessment()
-- refuses a course with no rubric, and the catalog flags one. A test with no
-- rubric is visible and requestable; it simply cannot be marked yet.
alter table courses drop constraint if exists courses_card_requires_rubric;

comment on column courses.rubric is
  'Scoring sheet: {passRule, parts[], criteria[]}. One part per test. Null means the evaluation form has not been supplied yet — the test can be requested and scheduled, but not assessed. The pass threshold comes from courses.pass_mark and, with passRule=per_item, applies to EVERY criterion.';

-- ---------------------------------------------------------------------------
-- 2. All fourteen become tests
-- ---------------------------------------------------------------------------

-- 70% and two years are the guidelines' figures, applied to every test.
-- CTCT01 legitimately has two rows (Distribution and Transmission); both are
-- tests.
update courses set
  outcome = 'card',
  exam_required = true,
  pass_mark = coalesce(pass_mark, 70),
  validity_months = 24
where code like 'CTCT%';

-- Disciplines for the rows that did not have one — the termination halves
-- inherited theirs, and 0039 set the rest.
update courses set discipline = 'Electrical' where code like 'CTCT%' and discipline is null;

-- ---------------------------------------------------------------------------
-- 3. Basic First Aid has to be reachable by Transmission contractors
-- ---------------------------------------------------------------------------

-- The four entry certificates include Basic First Aid, which exists only as
-- CSCC22 under contractor_category 'Distribution'. listActiveCourses() shows a
-- company its own category plus the category-agnostic courses, so a
-- Transmission contractor never sees CSCC22 — requiring it for CTCT18–CTCT22
-- would have built a gate nobody could pass.
--
-- Basic Fire Fighting is seeded twice for exactly this reason (CSCC21, and
-- CSCC24 for Transmission). First Aid has no twin, which reads as an omission
-- in the matrix rather than a decision that Transmission technicians need no
-- first aid. Setting it category-agnostic grants access without removing it
-- from anyone: null is visible to every company.
--
-- FLAGGED: if SEC genuinely excludes First Aid from the Transmission matrix,
-- revert this and drop group 4 from the Transmission tests instead.
update courses set contractor_category = null where code = 'CSCC22';

-- ---------------------------------------------------------------------------
-- 4. The four entry certificates, now on every technical test
-- ---------------------------------------------------------------------------

-- Groups 2–4 as in 0039, extended to the Transmission tests now that all four
-- are obtainable.
insert into course_prerequisites (course_id, prerequisite_course_id, group_no)
select t.id, p.id, g.group_no
from courses t
join (values
  ('CSCC13', 2),  -- OHS Representative
  ('CSCC21', 3),  -- Basic Fire Fighting
  ('CSCC24', 3),  -- ...its Transmission twin; same group, so either satisfies
  ('CSCC22', 4)   -- Basic First Aid
) as g(code, group_no) on true
join courses p on p.code = g.code
where t.code like 'CTCT%' and t.id <> p.id
on conflict do nothing;

-- Group 5 — Safe Working Procedures for the test's discipline. Its own group
-- rather than added to group 1, because group 1 is OR: folding the SWP in
-- beside an unrelated prerequisite would let either one satisfy both.
--
-- Only for tests that require NO Safe Working Procedures course today —
-- CTCT20 and CTCT22, which list Work at Heights and nothing else.
--
-- The `not exists` is load-bearing, not defensive. Relying on the unique index
-- to skip duplicates is not enough: for a Distribution test already listing
-- CSCC02 in group 1, the CSCC02 row conflicts and is skipped but the CSCC08
-- row does not — landing NG Electrical Safe Working Procedures in a group of
-- its own, as a separate AND. A Distribution technician never holds CSCC08,
-- so every one of them would have been refused.
insert into course_prerequisites (course_id, prerequisite_course_id, group_no)
select t.id, p.id, 5
from courses t
join courses p
  on (t.discipline in ('Electrical', 'Electrical-Electronics') and p.code in ('CSCC02', 'CSCC08'))
  or (t.discipline = 'Mechanical' and p.code = 'CSCC03')
where t.code like 'CTCT%'
  and t.id <> p.id
  and not exists (
    select 1
    from course_prerequisites cp
    join courses swp on swp.id = cp.prerequisite_course_id
    where cp.course_id = t.id and swp.code in ('CSCC02', 'CSCC03', 'CSCC08')
  )
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 5. Only the six priced tests keep a price
-- ---------------------------------------------------------------------------

-- Everything else inherited a regional figure from the training day-rate
-- formula, which never described a test. Showing it would be inventing a
-- price GCC Lab has not set. Ended rather than deleted, so anything invoiced
-- against the old figure still resolves it.
--
-- These tests stay fully requestable: the catalog shows no price, and
-- approveRequest() already accepts a unit-price override, so an admin quotes
-- the amount when it is confirmed and adds the permanent price from the
-- catalog screen.
update pricing set effective_to = current_date
where effective_to is null
  and course_id in (
    select id from courses
    where code like 'CTCT%'
      and code not in ('CTCT06','CTCT07','CTCT08','CTCT09','CTCT10','CTCT11')
  );
