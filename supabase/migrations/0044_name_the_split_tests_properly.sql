-- Name the split tests for what they now are.
--
-- 0039 split joint from termination but only appended a bracket to the old
-- combined title, leaving "Installation of Power Cable Joint and Termination
-- (Joint) – 33KV". It reads as a mistake because it is one: each test covers
-- the joint OR the termination, so a title still claiming both is wrong
-- whichever bracket follows it. Caught by looking at the rendered screen, not
-- at the migration output, where it had read as fine.
--
-- Written out per code rather than assembled with split_part(). The first
-- attempt did the latter and silently produced Arabic titles ending in a bare
-- "- " with the voltage gone: splitting bidirectional text on a separator that
-- renders in one position and is stored in another loses whatever followed it,
-- without erroring. Eight explicit rows cannot do that.
update courses set title_en = v.en, title_ar = v.ar
from (values
  ('CTCT06', 'Installation of Power Cable Joint – 1KV',          'تركيب وصلات كابلات القوى - 1 ك.ف'),
  ('CTCT07', 'Installation of Power Cable Termination – 1KV',    'تركيب نهايات كابلات القوى - 1 ك.ف'),
  ('CTCT08', 'Installation of Power Cable Joint – 13.8KV',       'تركيب وصلات كابلات القوى - 13.8 ك.ف'),
  ('CTCT09', 'Installation of Power Cable Termination – 13.8KV', 'تركيب نهايات كابلات القوى - 13.8 ك.ف'),
  ('CTCT10', 'Installation of Power Cable Joint – 33KV',         'تركيب وصلات كابلات القوى - 33 ك.ف'),
  ('CTCT11', 'Installation of Power Cable Termination – 33KV',   'تركيب نهايات كابلات القوى - 33 ك.ف'),
  ('CTCT12', 'Installation of Power Cable Joint – 69KV',         'تركيب وصلات كابلات القوى - 69 ك.ف'),
  ('CTCT13', 'Installation of Power Cable Termination – 69KV',   'تركيب نهايات كابلات القوى - 69 ك.ف')
) as v(code, en, ar)
where courses.code = v.code;
