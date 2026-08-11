-- Technical certification tests: real entry requirements, real prices, and
-- joint split from termination.
--
-- Three corrections, all from GCC Lab's own lists.
--
-- 1. ENTRY REQUIREMENTS ARE AN "AND", AND THE PLATFORM COULD ONLY EXPRESS "OR".
--
--    A technician must hold FOUR certificates to sit a technical test:
--      · Safe Working Procedures — Electrical or Mechanical, per the test
--      · OHS Representative
--      · Basic Fire Fighting
--      · Basic First Aid
--
--    course_prerequisites could not say that. getPrerequisiteGroups() put
--    every listed prerequisite into ONE group, and a group is satisfied by
--    holding any single course in it. Four rows would therefore have admitted
--    a technician holding Basic First Aid and nothing else — the exact
--    opposite of the rule. This migration adds `group_no`: OR within a group,
--    AND across groups. Existing rows all become group 1, so every course
--    that predates this behaves precisely as it did.
--
--    Grouping also handles the codes that legitimately have two forms — Basic
--    Fire Fighting exists as CSCC21 and, for Transmission, CSCC24. Both go in
--    one group, so either satisfies it.
--
-- 2. JOINT AND TERMINATION ARE SEPARATE TESTS.
--
--    Own code, own day, own 695 SAR. The catalog carried only the even codes
--    under a combined "Joint and Termination" title, and its gaps were exactly
--    CTCT07/09/11/13 — the codes GCC Lab uses for the termination halves.
--    Each test therefore has ONE rubric part and five criteria, not two parts
--    and ten.
--
-- 3. THE PRICE IS NATIONAL.
--
--    695 SAR flat for the six cable tests GCC Lab has priced. The regional
--    450–1,100 they carried came from a training day-rate formula and never
--    described these. Old rows are end-dated, never deleted, so past invoices
--    stay reconcilable.

-- ---------------------------------------------------------------------------
-- 1. Prerequisite groups
-- ---------------------------------------------------------------------------

alter table course_prerequisites add column group_no integer not null default 1;
alter table course_prerequisites add constraint course_prerequisites_group_no_positive
  check (group_no >= 1);

create index course_prerequisites_course_group_idx
  on course_prerequisites (course_id, group_no);

comment on column course_prerequisites.group_no is
  'OR within a group, AND across groups. Group 1 is the course''s original requirement; further groups are additional certificates that must ALSO be held.';

-- The discipline decides which Safe Working Procedures course applies, and
-- matches the guidelines'' rule that a candidate''s occupation must be a
-- suitable electrical or mechanical specialisation.
alter table courses add column discipline text;
alter table courses add constraint courses_discipline_check
  check (discipline is null or discipline in ('Electrical', 'Mechanical', 'Electrical-Electronics'));

comment on column courses.discipline is
  'Technical discipline of a certification test. Decides which Safe Working Procedures certificate is required.';

update courses set discipline = 'Mechanical'             where code = 'CTCT02';
update courses set discipline = 'Electrical-Electronics' where code = 'CTCT21';
update courses set discipline = 'Electrical'
  where code in ('CTCT01','CTCT03','CTCT04','CTCT05','CTCT06','CTCT08','CTCT10','CTCT12',
                 'CTCT18','CTCT19','CTCT20','CTCT22');

-- ---------------------------------------------------------------------------
-- 2. Split joint from termination
-- ---------------------------------------------------------------------------

update courses set
  title_en = replace(title_en, ' – ', ' (Joint) – '),
  title_ar = title_ar || ' (وصل)'
where code in ('CTCT06', 'CTCT08', 'CTCT10', 'CTCT12');

-- The termination halves, copied from their siblings so category, duration,
-- validity and outcome cannot drift apart.
insert into courses (
  code, title_en, title_ar, description, duration_hours, min_attendance_pct,
  exam_required, pass_mark, validity_months, contractor_category, outcome, discipline
)
select
  v.new_code,
  replace(c.title_en, ' (Joint) – ', ' (Termination) – '),
  replace(c.title_ar, ' (وصل)', ' (إنهاء)'),
  c.description, c.duration_hours, c.min_attendance_pct,
  c.exam_required, c.pass_mark, c.validity_months, c.contractor_category,
  -- Born as a certificate deliberately: courses_card_requires_rubric (0038)
  -- refuses a card-awarding course with nothing to score it against, and the
  -- rubric is set a few statements below. Promoted to 'card' there.
  'certificate', c.discipline
from (values
  ('CTCT06','CTCT07'), ('CTCT08','CTCT09'), ('CTCT10','CTCT11'), ('CTCT12','CTCT13')
) as v(from_code, new_code)
join courses c on c.code = v.from_code and c.contractor_category = 'Distribution'
where not exists (select 1 from courses x where x.code = v.new_code);

-- Same eligible job role — the role covers both operations at that voltage.
insert into course_job_roles (course_id, job_role_id)
select nc.id, cjr.job_role_id
from (values ('CTCT06','CTCT07'),('CTCT08','CTCT09'),('CTCT10','CTCT11'),('CTCT12','CTCT13'))
       as v(from_code, new_code)
join courses oc on oc.code = v.from_code and oc.contractor_category = 'Distribution'
join courses nc on nc.code = v.new_code
join course_job_roles cjr on cjr.course_id = oc.id
on conflict do nothing;

-- Same prerequisites, groups included.
insert into course_prerequisites (course_id, prerequisite_course_id, group_no)
select nc.id, cp.prerequisite_course_id, cp.group_no
from (values ('CTCT06','CTCT07'),('CTCT08','CTCT09'),('CTCT10','CTCT11'),('CTCT12','CTCT13'))
       as v(from_code, new_code)
join courses oc on oc.code = v.from_code and oc.contractor_category = 'Distribution'
join courses nc on nc.code = v.new_code
join course_prerequisites cp on cp.course_id = oc.id
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 3. One rubric part per test
-- ---------------------------------------------------------------------------

-- The Cable Technician Evaluation sheet shows Splicing and Termination side by
-- side because a technician often sits both. Each is its own test, so each
-- course scores one of them: five criteria at 20, and 70% required in EVERY
-- one of them. A technician scoring 18/16/19/17/10 has 80 of 100 and has
-- failed, because the insulation mark is under 14.
update courses set rubric = jsonb_build_object(
  'passRule', 'per_item',
  'parts', jsonb_build_array(
    case when code in ('CTCT06','CTCT08','CTCT10','CTCT12')
      then jsonb_build_object('code','joint',      'en','Splicing / Joint Test','ar','اختبار الوصل')
      else jsonb_build_object('code','termination','en','Termination Test',     'ar','اختبار النهايات')
    end
  ),
  'criteria', jsonb_build_array(
    jsonb_build_object('code','safety',      'max',20,'en','Safety terms',                    'ar','اشتراطات السلامة'),
    jsonb_build_object('code','preparation', 'max',20,'en','Cable preparation',               'ar','تجهيز الكابل'),
    jsonb_build_object('code','assembly',    'max',20,'en','Assembly of joint / termination', 'ar','تركيب الوصلة / النهاية'),
    jsonb_build_object('code','skills',      'max',20,'en','Technician skills',               'ar','مهارات الفني'),
    jsonb_build_object('code','insulation',  'max',20,'en','Insulation test',                 'ar','اختبار العزل')
  )
)
where code in ('CTCT06','CTCT07','CTCT08','CTCT09','CTCT10','CTCT11','CTCT12','CTCT13');

update courses set outcome = 'card', exam_required = true, pass_mark = 70, validity_months = 24
where code in ('CTCT06','CTCT07','CTCT08','CTCT09','CTCT10','CTCT11','CTCT12','CTCT13');

-- ---------------------------------------------------------------------------
-- 4. The four entry certificates
-- ---------------------------------------------------------------------------

-- Applied to the Distribution and category-agnostic technical tests, where all
-- four certificates exist and a contractor can actually obtain them.
--
-- NOT applied to the Transmission tests (CTCT18–CTCT22, and the Transmission
-- row of CTCT01). Basic First Aid exists only as CSCC22, a Distribution
-- course, so a Transmission company never sees it in its catalog — requiring
-- it there would create a gate nobody could pass. Those tests need their own
-- mapping, which has not been supplied.
--
-- Group 1 is left exactly as the SEC matrix seeded it: the appropriate Safe
-- Working Procedures course(s) for that test, OR-ed. CTCT02 already carries
-- CSCC03 (Mechanical); every other test carries CSCC02 and/or CSCC08.
insert into course_prerequisites (course_id, prerequisite_course_id, group_no)
select t.id, p.id, g.group_no
from courses t
join (values
  ('CSCC13', 2),  -- OHS Representative
  ('CSCC21', 3),  -- Basic Fire Fighting
  ('CSCC24', 3),  -- ...its Transmission twin, same group so either satisfies
  ('CSCC22', 4)   -- Basic First Aid
) as g(code, group_no) on true
join courses p on p.code = g.code
where t.code like 'CTCT%'
  and t.contractor_category is distinct from 'Transmission'
  and t.id <> p.id
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 5. Pricing
-- ---------------------------------------------------------------------------

-- The inherited regional prices described a training day, not a test. Ended,
-- not deleted: a request invoiced last month must still resolve what it was
-- charged.
update pricing set effective_to = current_date
where course_id in (select id from courses where code in
      ('CTCT06','CTCT07','CTCT08','CTCT09','CTCT10','CTCT11','CTCT12','CTCT13'))
  and effective_to is null;

-- 695 SAR, nationally. region null = the price everywhere; resolvePrice()
-- already prefers a regional row and falls back to this, so a regional
-- override remains possible later without any code change.
insert into pricing (course_id, region, price, currency, effective_from)
select id, null, 695.00, 'SAR', current_date
from courses where code in ('CTCT06','CTCT07','CTCT08','CTCT09','CTCT10','CTCT11');

-- CTCT12 and CTCT13 (69KV) are deliberately left with NO active price. GCC Lab
-- has not set one, and showing the old training figure would be inventing a
-- number. The catalog renders no price, and an admin can still approve by
-- entering the amount — approveRequest() already takes a unit-price override.

comment on column courses.rubric is
  'Scoring sheet: {passRule, parts[], criteria[]}. One part per test. The pass threshold comes from courses.pass_mark and, with passRule=per_item, applies to EVERY criterion.';
