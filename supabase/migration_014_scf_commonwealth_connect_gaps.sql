-- ============================================================
-- Migration 014: Fill SCF coverage gaps (Commonwealth Connect + CT/NM/OR)
-- ============================================================
-- 11 cities confirmed SCF-backed by research on 2026-04-21 but missed by
-- the recent_place_stats scraper that seeded migration 013.
--
-- MA cities participate via Commonwealth Connect (commonwealthconnect.io),
-- CT via SCF origin-region deployments, NM via official city apps
-- (com.seeclickfix.albuquerque.app etc), Eugene OR via native SCF community.
--
-- Boundaries populated post-hoc by enrich-authority-boundaries.
-- ============================================================

INSERT INTO authorities (name, level, state, city, submission_methods) VALUES
('Hartford (SeeClickFix)', 'city', 'CT', 'Hartford',
  '[{"method":"api","endpoint":"https://seeclickfix.com/api/v2/issues","priority":1,"protocol":"seeclickfix","notes":"SeeClickFix API (routes by lat/lng)"}]'::jsonb),
('Stamford (SeeClickFix)', 'city', 'CT', 'Stamford',
  '[{"method":"api","endpoint":"https://seeclickfix.com/api/v2/issues","priority":1,"protocol":"seeclickfix","notes":"SeeClickFix API (routes by lat/lng)"}]'::jsonb),
('Waterbury (SeeClickFix)', 'city', 'CT', 'Waterbury',
  '[{"method":"api","endpoint":"https://seeclickfix.com/api/v2/issues","priority":1,"protocol":"seeclickfix","notes":"SeeClickFix API (routes by lat/lng)"}]'::jsonb),
('Lowell (SeeClickFix)', 'city', 'MA', 'Lowell',
  '[{"method":"api","endpoint":"https://seeclickfix.com/api/v2/issues","priority":1,"protocol":"seeclickfix","notes":"SeeClickFix API (routes by lat/lng)"}]'::jsonb),
('New Bedford (SeeClickFix)', 'city', 'MA', 'New Bedford',
  '[{"method":"api","endpoint":"https://seeclickfix.com/api/v2/issues","priority":1,"protocol":"seeclickfix","notes":"SeeClickFix API (routes by lat/lng)"}]'::jsonb),
('Quincy (SeeClickFix)', 'city', 'MA', 'Quincy',
  '[{"method":"api","endpoint":"https://seeclickfix.com/api/v2/issues","priority":1,"protocol":"seeclickfix","notes":"SeeClickFix API (routes by lat/lng)"}]'::jsonb),
('Springfield (SeeClickFix)', 'city', 'MA', 'Springfield',
  '[{"method":"api","endpoint":"https://seeclickfix.com/api/v2/issues","priority":1,"protocol":"seeclickfix","notes":"SeeClickFix API (routes by lat/lng)"}]'::jsonb),
('Santa Fe (SeeClickFix)', 'city', 'NM', 'Santa Fe',
  '[{"method":"api","endpoint":"https://seeclickfix.com/api/v2/issues","priority":1,"protocol":"seeclickfix","notes":"SeeClickFix API (routes by lat/lng)"}]'::jsonb),
('Las Cruces (SeeClickFix)', 'city', 'NM', 'Las Cruces',
  '[{"method":"api","endpoint":"https://seeclickfix.com/api/v2/issues","priority":1,"protocol":"seeclickfix","notes":"SeeClickFix API (routes by lat/lng)"}]'::jsonb),
('Rio Rancho (SeeClickFix)', 'city', 'NM', 'Rio Rancho',
  '[{"method":"api","endpoint":"https://seeclickfix.com/api/v2/issues","priority":1,"protocol":"seeclickfix","notes":"SeeClickFix API (routes by lat/lng)"}]'::jsonb),
('Eugene (SeeClickFix)', 'city', 'OR', 'Eugene',
  '[{"method":"api","endpoint":"https://seeclickfix.com/api/v2/issues","priority":1,"protocol":"seeclickfix","notes":"SeeClickFix API (routes by lat/lng)"}]'::jsonb);
