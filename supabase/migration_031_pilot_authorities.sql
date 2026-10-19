-- ============================================================
-- Migration 031: Pilot authorities (tier 1: Pioneer Valley MA,
-- tier 2: Citrus County FL) + road-owner mapping
-- ============================================================
-- Channels verified on official pages / the SeeClickFix GeoReport API on
-- 2026-10-19. Boundaries are filled afterwards by
-- enrich-authority-boundaries (Census TIGER; county level supported).
--
-- Notes carried into submission_methods where a channel is imperfect:
--   - DCR publishes no roadway-maintenance channel; the general inbox is
--     the only automated route.
--   - FDOT, Northampton and Crystal River publish no maintenance email;
--     their web forms queue for manual submission (dispatch-outbound).
-- ============================================================

INSERT INTO public.authorities (name, level, state, city, county, submission_methods)
SELECT v.name, v.level, v.state, v.city, v.county, v.methods::jsonb
FROM (VALUES
  ('Town of Amherst DPW', 'town', 'MA', 'Amherst', 'Hampshire', $j$[
    {"method":"api","protocol":"seeclickfix","endpoint":"https://seeclickfix.com/api/v2/issues","priority":1,"notes":"Amherst Connect (SeeClickFix) — routes by lat/lng"},
    {"method":"email","endpoint":"publicworks@amherstma.gov","priority":2,"notes":"DPW inbox"},
    {"method":"web_form","endpoint":"https://www.amherstma.gov/amherstconnect","priority":3},
    {"method":"phone","endpoint":"413-259-3050","priority":4,"notes":"ext. 0; after hours police 413-259-3000"}
  ]$j$),
  ('City of Northampton DPW', 'city', 'MA', 'Northampton', 'Hampshire', $j$[
    {"method":"web_form","endpoint":"https://northamptonma.gov/forms.aspx?FID=64","priority":1,"notes":"Pothole form. Also: traffic sign FID=71, streetlight FID=63, obstructed sidewalk FID=91, roadway obstruction FID=78, unshoveled sidewalk FID=73; trees /785/Tree-Request-Forms"},
    {"method":"phone","endpoint":"413-587-1570","priority":2,"notes":"DPW, 125 Locust St"}
  ]$j$),
  ('City of Easthampton DPW', 'city', 'MA', 'Easthampton', 'Hampshire', $j$[
    {"method":"api","protocol":"seeclickfix","endpoint":"https://seeclickfix.com/api/v2/issues","priority":1,"notes":"SeeClickFix org 'Easthampton, MA' — routes by lat/lng"},
    {"method":"email","endpoint":"dpw@easthamptonma.gov","priority":2},
    {"method":"web_form","endpoint":"https://www.easthamptonma.gov/portal?portalpage=embedded/civicservice","priority":3},
    {"method":"phone","endpoint":"413-529-1400","priority":4,"notes":"ext. 410, Mon–Thu 7:30–5"}
  ]$j$),
  ('Massachusetts DCR (Department of Conservation and Recreation)', 'state', 'MA', NULL, NULL, $j$[
    {"method":"email","endpoint":"mass.parks@mass.gov","priority":1,"notes":"General DCR inbox — DCR publishes no roadway-maintenance channel. Owns parkways (e.g. Memorial Drive, Storrow Drive)."},
    {"method":"phone","endpoint":"617-626-1250","priority":2,"notes":"Main office"}
  ]$j$),
  ('Citrus County Road Maintenance', 'county', 'FL', NULL, 'Citrus', $j$[
    {"method":"email","endpoint":"roadmaintenance@citrusbocc.gov","priority":1,"notes":"County-accepted roads only"},
    {"method":"web_form","endpoint":"https://portal.citrusbocc.com","priority":2,"notes":"Service Request Portal (account required)"},
    {"method":"phone","endpoint":"352-527-7610","priority":3,"notes":"Mon–Fri 6:30–5; general 352-527-5200"}
  ]$j$),
  ('City of Inverness Public Works', 'city', 'FL', 'Inverness', 'Citrus', $j$[
    {"method":"email","endpoint":"PublicWorks@Inverness.gov","priority":1},
    {"method":"web_form","endpoint":"https://inverness.gov/FormCenter/Public-Works-16/Pothole-Report-60","priority":2},
    {"method":"phone","endpoint":"352-726-2611","priority":3,"notes":"After-hours roads 352-422-1422. Streetlights: utility (SECO / Duke)"}
  ]$j$),
  ('City of Crystal River Public Works', 'city', 'FL', 'Crystal River', 'Citrus', $j$[
    {"method":"web_form","endpoint":"https://www.crystalriverfl.org/publicworks/page/report-issue","priority":1,"notes":"Pothole / Street Light Out / Other (reCAPTCHA — manual)"},
    {"method":"phone","endpoint":"352-795-4216","priority":2,"notes":"ext. 314"}
  ]$j$),
  ('FDOT (Florida Department of Transportation)', 'state', 'FL', NULL, NULL, $j$[
    {"method":"web_form","endpoint":"https://www.fdot.gov/info/ects/customer-service-portal","priority":1,"notes":"Statewide customer service portal (report an issue). State Highway System incl. Turnpike."},
    {"method":"phone","endpoint":"866-374-3368","priority":2,"notes":"Statewide. District 7 (Citrus, Hernando, Hillsborough, Pasco, Pinellas): 813-975-6000 / 800-226-7220"}
  ]$j$),
  ('City of Fort Collins Streets', 'city', 'CO', 'Fort Collins', 'Larimer', $j$[
    {"method":"email","endpoint":"streets@fortcollins.gov","priority":1},
    {"method":"web_form","endpoint":"https://fortcollinsco.citysourced.com/","priority":2,"notes":"Access Fort Collins (CitySourced)"},
    {"method":"phone","endpoint":"970-221-6615","priority":3}
  ]$j$),
  ('City of Springfield DPW', 'city', 'OR', 'Springfield', 'Lane', $j$[
    {"method":"email","endpoint":"dpw@springfield-or.gov","priority":1},
    {"method":"phone","endpoint":"541-726-3761","priority":2,"notes":"Operations & Maintenance. Streetlights: Springfield Utility Board 541-744-3726"}
  ]$j$)
) AS v(name, level, state, city, county, methods)
WHERE NOT EXISTS (SELECT 1 FROM public.authorities a WHERE a.name = v.name);

-- Road owners → authorities (see migration 030).
INSERT INTO public.road_owners (source, owner_code, authority_id, label)
SELECT v.source, v.code, a.id, v.label
FROM (VALUES
  ('massdot_ri', '1', 'MassDOT (Massachusetts Department of Transportation)', 'MassDOT state highway'),
  ('massdot_ri', '3', 'Massachusetts DCR (Department of Conservation and Recreation)', 'DCR parkway'),
  ('fdot_shs', 'SHS', 'FDOT (Florida Department of Transportation)', 'Florida State Highway System'),
  ('fdot_shs', 'TURNPIKE', 'FDOT (Florida Department of Transportation)', 'Florida''s Turnpike (FDOT)')
) AS v(source, code, authority_name, label)
JOIN public.authorities a ON a.name = v.authority_name
ON CONFLICT (source, owner_code) DO UPDATE SET authority_id = EXCLUDED.authority_id, label = EXCLUDED.label;

-- Retry boundaries the old lookup missed (Eugene; Weymouth is "Weymouth Town" in TIGER).
UPDATE public.authorities SET boundary_checked_at = NULL
WHERE boundary_geojson IS NULL AND name IN ('Eugene (SeeClickFix)', 'Weymouth DPW');
