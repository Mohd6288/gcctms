-- Reference data seeded on every local `supabase db reset` (see
-- [db.seed] in config.toml). Job roles feed course_job_roles (the
-- certificate eligibility gate) and the employee form's role select —
-- Phase 4.5 gives these full CRUD; until then they're a fixed baseline so
-- Phase 3's employee flow has something real to select from.
insert into job_roles (code, name_en, name_ar, active) values
  ('GEN', 'General Worker', 'عامل عام', true),
  ('ELEC', 'Electrician', 'كهربائي', true),
  ('RIG', 'Rigger', 'مُعلِّق أحمال (ريغر)', true),
  ('SCAF', 'Scaffolder', 'فني سقالات', true),
  ('WELD', 'Welder', 'لحّام', true),
  ('CRANE', 'Crane Operator', 'مشغل رافعة', true),
  ('HEO', 'Heavy Equipment Operator', 'مشغل معدات ثقيلة', true),
  ('SUPV', 'Supervisor', 'مشرف', true),
  ('SAFETY', 'Safety Officer', 'مسؤول سلامة', true),
  ('PIPE', 'Pipefitter', 'فني تمديد أنابيب', true)
on conflict (code) do nothing;
