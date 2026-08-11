-- Two tests need a different Safe Working Procedures rule from the default.
--
-- The discipline column gives each test one SWP course. Two of them do not fit
-- that, and the difference between them is exactly the difference between an
-- AND and an OR — which is what group_no exists to express.

-- CTCT18 Transformer Maintenance requires BOTH. Transformer work is electrical
-- and mechanical at once, so a technician needs the electrical procedures AND
-- the mechanical ones. Its own group, because two courses in one group would
-- mean either alone was enough.
insert into course_prerequisites (course_id, prerequisite_course_id, group_no)
select t.id, p.id, 4
from courses t
join courses p on p.code = 'CSCC03'
where t.code = 'CTCT18'
on conflict do nothing;

-- CTCT02 Heavy Vehicles Safe Operation accepts EITHER. It is the one
-- mechanical test on the list, but a technician holding the electrical
-- procedures is acceptable to GCC Lab — so CSCC02 joins CSCC03 in group 1,
-- where either satisfies the requirement.
insert into course_prerequisites (course_id, prerequisite_course_id, group_no)
select t.id, p.id, 1
from courses t
join courses p on p.code = 'CSCC02'
where t.code = 'CTCT02'
on conflict do nothing;

-- Recorded on the course itself so the upload screen can tell a contractor
-- WHICH certificates to produce, in words, rather than leaving them to work it
-- out from a refusal after the fact.
comment on column courses.discipline is
  'Technical discipline of a certification test. Drives the default Safe Working Procedures requirement, which individual tests may widen (CTCT02 accepts electrical or mechanical) or deepen (CTCT18 requires both).';
