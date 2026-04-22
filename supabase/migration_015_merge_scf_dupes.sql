-- ============================================================
-- Migration 015: Merge migration 014 SCF duplicates
-- ============================================================
-- Migration 014 naively INSERTed (SeeClickFix) rows for 7 cities that
-- already had email/web_form/phone authorities from migration 010 (NE
-- email coverage). Result: two active rows per city, which breaks
-- find_authority_by_point() (returns the wrong one arbitrarily) and
-- misrepresents coverage in admin UIs.
--
-- Fix: prepend the SCF API method (priority 1) to the existing DPW
-- row's submission_methods array, re-number the rest (2, 3, ...), and
-- delete the standalone (SeeClickFix) row.
--
-- Cities affected: Hartford, Stamford, Waterbury CT; Lowell, New
-- Bedford, Quincy, Springfield MA.
-- ============================================================

UPDATE authorities a
SET submission_methods =
  jsonb_build_array(
    '{"method":"api","endpoint":"https://seeclickfix.com/api/v2/issues","priority":1,"protocol":"seeclickfix","notes":"SeeClickFix API (routes by lat/lng)"}'::jsonb
  ) ||
  COALESCE(
    (SELECT jsonb_agg(jsonb_set(elem, '{priority}', to_jsonb((elem->>'priority')::int + 1)))
     FROM jsonb_array_elements(a.submission_methods) elem),
    '[]'::jsonb
  ),
  updated_at = now()
WHERE (state, city) IN (('CT','Hartford'),('CT','Stamford'),('CT','Waterbury'),
                        ('MA','Lowell'),('MA','New Bedford'),('MA','Quincy'),('MA','Springfield'))
  AND name NOT LIKE '%(SeeClickFix)%'
  AND NOT (submission_methods @> '[{"protocol":"seeclickfix"}]');

DELETE FROM authorities
WHERE (state, city) IN (('CT','Hartford'),('CT','Stamford'),('CT','Waterbury'),
                        ('MA','Lowell'),('MA','New Bedford'),('MA','Quincy'),('MA','Springfield'))
  AND name LIKE '%(SeeClickFix)%';
