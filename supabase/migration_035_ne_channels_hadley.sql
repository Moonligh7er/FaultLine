-- ============================================================
-- Migration 035: Channels for New England no-channel authorities;
-- Hadley, South Hadley, Hatfield (Pioneer Valley pilot neighbors)
-- ============================================================
-- Verified on official town pages 2026-10-27 (source URLs in notes).
-- Order: SeeClickFix API (only where the town runs a SeeClickFix org) →
-- published email → official web form (manual queue; most have CAPTCHAs,
-- so the web-form worker can't submit them) → phone (never automated).
-- Rochester NH and Cranston RI publish phone numbers only.
-- ============================================================

-- New authorities (boundaries filled by enrich-authority-boundaries).
INSERT INTO public.authorities (name, level, state, city, county, submission_methods)
SELECT v.name, 'town', 'MA', v.city, 'Hampshire', v.methods::jsonb
FROM (VALUES
  ('Town of Hadley DPW', 'Hadley', $j$[
    {"method":"email","endpoint":"publicworks@hadleyma.gov","priority":1,"notes":"DPW inbox; https://www.hadleyma.org/highway-division"},
    {"method":"web_form","endpoint":"https://www.hadleyma.org/home/webforms/contact-us","priority":2,"notes":"General town contact form (manual)"},
    {"method":"phone","endpoint":"413-586-2390","priority":3,"notes":"Streetlights / limbs on wires: Eversource"}
  ]$j$),
  ('Town of South Hadley DPW', 'South Hadley', $j$[
    {"method":"email","endpoint":"ebeattie@southhadleyma.gov","priority":1,"notes":"Highway Superintendent (no shared DPW inbox); https://southhadley.org/355/Highway-Division"},
    {"method":"web_form","endpoint":"https://southhadley.org/FormCenter/Public-Works-5/Highway-Service-Request-Form-45","priority":2,"notes":"Highway service request (CivicPlus, CAPTCHA — manual)"},
    {"method":"phone","endpoint":"413-538-5033","priority":3,"notes":"24/7. Streetlights: town electric dept 413-536-1050"}
  ]$j$),
  ('Town of Hatfield DPW', 'Hatfield', $j$[
    {"method":"email","endpoint":"mwarner@townofhatfield.org","priority":1,"notes":"DPW Director (no shared inbox); https://www.townofhatfield.org/220/Department-of-Public-Works"},
    {"method":"web_form","endpoint":"https://www.townofhatfield.org/FormCenter/General-Forms-4/Report-a-Concern-46","priority":2,"notes":"Town-wide Report a Concern (CivicPlus, CAPTCHA — manual)"},
    {"method":"phone","endpoint":"413-247-0322","priority":3,"notes":"Highway garage 413-247-5646"}
  ]$j$)
) AS v(name, city, methods)
WHERE NOT EXISTS (SELECT 1 FROM public.authorities a WHERE a.state = 'MA' AND a.city = v.city AND a.is_active);

-- Existing New England authorities: replace phone-only / empty methods.
UPDATE public.authorities a SET submission_methods = v.methods::jsonb, updated_at = NOW()
FROM (VALUES
  ('6f371a09-31ab-447a-b977-2eda692bc60d'::uuid, $j$[
    {"method":"api","protocol":"seeclickfix","endpoint":"https://seeclickfix.com/api/v2/issues","priority":1,"notes":"Gloucester runs SeeClickFix (Citizen Request)"},
    {"method":"web_form","endpoint":"https://gloucester-ma.gov/835/Citizen-Request","priority":2},
    {"method":"phone","endpoint":"978-325-5600","priority":3}
  ]$j$),
  ('1e811fa9-2192-4ecb-9e10-4bddc4c70772'::uuid, $j$[
    {"method":"web_form","endpoint":"https://peabody-ma.gov/problem-reporter.html","priority":1,"notes":"Problem Reporter (JotForm) — manual"},
    {"method":"phone","endpoint":"978-536-0600","priority":2,"notes":"Public Services"}
  ]$j$),
  ('0a51dd46-5d5c-4f76-a906-0bd478c2b069'::uuid, $j$[
    {"method":"api","protocol":"seeclickfix","endpoint":"https://seeclickfix.com/api/v2/issues","priority":1,"notes":"Salem runs a SeeClickFix portal"},
    {"method":"web_form","endpoint":"https://seeclickfix.com/web_portal/9uMKWtTC6yi8SAffD2v7iGGd/report/category","priority":2},
    {"method":"phone","endpoint":"978-744-3302","priority":3}
  ]$j$),
  ('a8ba9ff0-f54a-469b-b24d-702dd2c6b166'::uuid, $j$[
    {"method":"web_form","endpoint":"https://waltham.portal.iworq.net/portalhome/waltham","priority":1,"notes":"iWorQ portal — manual"},
    {"method":"phone","endpoint":"781-314-3855","priority":2,"notes":"Potholes; streetlights 781-314-3175; signs 781-314-3400"}
  ]$j$),
  ('dadc1e58-2522-4bbc-8ddf-340c55a5fb94'::uuid, $j$[
    {"method":"email","endpoint":"dpw@weymouth.ma.us","priority":1,"notes":"DPW inbox; https://www.weymouth.ma.us/1625/Service-Request-Form"},
    {"method":"web_form","endpoint":"https://www.weymouth.ma.us/1625/Service-Request-Form","priority":2,"notes":"CAPTCHA — manual"},
    {"method":"phone","endpoint":"781-337-5100","priority":3}
  ]$j$),
  ('0c2812ba-e9ef-41e5-adb8-518683653412'::uuid, $j$[
    {"method":"web_form","endpoint":"https://service.dover.nh.gov/RequestPortal","priority":1,"notes":"VUEWorks request portal (Streets) — manual"},
    {"method":"phone","endpoint":"603-516-7845","priority":2,"notes":"Pothole hotline; Community Services 603-516-6450"}
  ]$j$),
  ('d8edb633-6978-4c17-9478-9eb3d7306820'::uuid, $j$[
    {"method":"phone","endpoint":"603-332-4096","priority":1,"notes":"No online request channel published (checked 2026-10-27)"}
  ]$j$),
  ('3ca245c8-82f9-45a6-b0ea-c927e7df4f2c'::uuid, $j$[
    {"method":"phone","endpoint":"401-780-3175","priority":1,"notes":"Public Works; no request portal or inbox published (checked 2026-10-27)"}
  ]$j$),
  ('6757a021-886c-4aea-af1c-533e6888fe8c'::uuid, $j$[
    {"method":"web_form","endpoint":"https://citizenportal.dudesolutions.com/pawtucketri/home","priority":1,"notes":"Brightly citizen portal (street/sidewalk, streetlight, sign) — manual"},
    {"method":"phone","endpoint":"401-728-0500","priority":2}
  ]$j$),
  ('a13fad10-a112-479d-8f96-2fea5f1dbdb5'::uuid, $j$[
    {"method":"web_form","endpoint":"https://docs.google.com/forms/d/17_qFnotWo5zDfL4N61ms5v2nzVojEdR2l9puElkV-Mc/viewform","priority":1,"notes":"Pothole Google Form linked from DPW page — manual"},
    {"method":"phone","endpoint":"401-738-2003","priority":2}
  ]$j$)
) AS v(id, methods)
WHERE a.id = v.id;
