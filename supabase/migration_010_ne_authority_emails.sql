-- ============================================================
-- Migration 010: New England email coverage + CT/ME/VT expansion
-- ============================================================
-- UPDATE existing MA/RI/NH authorities where a department email was
-- verified on the official city website, adding it to the front of
-- submission_methods (priority 1) so escalate-clusters uses it.
--
-- INSERT new authorities for CT, ME, VT covering the major cities +
-- state DOTs. This closes the Fault Line coverage gap across all six
-- New England states.
--
-- Emails were verified on official .gov / .us / city domains — see
-- `research/new-england-authority-emails.md` for the full citation
-- list. Entries without a verified email continue using their
-- existing web_form / phone methods (no change).
-- ============================================================

-- ============================================================
-- MASSACHUSETTS — add verified emails to existing entries
-- ============================================================

UPDATE authorities SET submission_methods =
  '[{"method": "api", "endpoint": "https://311.boston.gov/open311/v2/requests.json", "priority": 1, "protocol": "open311", "notes": "Open311 API"},
    {"method": "email", "endpoint": "311@boston.gov", "priority": 2, "notes": "Boston 311 inbox"},
    {"method": "web_form", "endpoint": "https://311.boston.gov/", "priority": 3},
    {"method": "phone", "endpoint": "311", "priority": 4}]'::jsonb
WHERE name = 'Boston 311';

UPDATE authorities SET submission_methods =
  '[{"method": "api", "endpoint": "https://seeclickfix.com/api/v2/issues", "priority": 1, "protocol": "seeclickfix", "notes": "SeeClickFix API"},
    {"method": "email", "endpoint": "theworks@cambridgema.gov", "priority": 2, "notes": "Cambridge DPW general inbox"},
    {"method": "web_form", "endpoint": "https://seeclickfix.com/cambridge", "priority": 3}]'::jsonb
WHERE name = 'Cambridge SeeClickFix';

UPDATE authorities SET submission_methods =
  '[{"method": "email", "endpoint": "311@worcesterma.gov", "priority": 1, "notes": "Worcester 311"},
    {"method": "web_form", "endpoint": "https://www.worcesterma.gov/dpw/report-a-problem", "priority": 2},
    {"method": "phone", "endpoint": "508-929-1300", "priority": 3}]'::jsonb
WHERE name = 'Worcester DPW';

UPDATE authorities SET submission_methods =
  '[{"method": "email", "endpoint": "dpw@cobma.us", "priority": 1, "notes": "Brockton DPW general inbox"},
    {"method": "phone", "endpoint": "508-580-7890", "priority": 2}]'::jsonb
WHERE name = 'Brockton DPW';

UPDATE authorities SET submission_methods =
  '[{"method": "email", "endpoint": "engineering@newbedford-ma.gov", "priority": 1, "notes": "New Bedford Engineering intake"},
    {"method": "phone", "endpoint": "508-979-1550", "priority": 2},
    {"method": "web_form", "endpoint": "https://www.newbedford-ma.gov/public-infrastructure/report-a-problem/", "priority": 3}]'::jsonb
WHERE name = 'New Bedford DPW';

UPDATE authorities SET submission_methods =
  '[{"method": "email", "endpoint": "streets@fallriverma.gov", "priority": 1, "notes": "Fall River Streets & Highways"},
    {"method": "phone", "endpoint": "508-324-2600", "priority": 2}]'::jsonb
WHERE name = 'Fall River DPW';

UPDATE authorities SET submission_methods =
  '[{"method": "email", "endpoint": "ahall@lynnma.gov", "priority": 1, "notes": "DPW Commissioner (dept-level email not published)"},
    {"method": "phone", "endpoint": "781-268-8000", "priority": 2}]'::jsonb
WHERE name = 'Lynn DPW';

UPDATE authorities SET submission_methods =
  '[{"method": "email", "endpoint": "311requests@somervillema.gov", "priority": 1, "notes": "Somerville 311 inbox"},
    {"method": "web_form", "endpoint": "https://www.somervillema.gov/departments/311", "priority": 2},
    {"method": "phone", "endpoint": "311", "priority": 3}]'::jsonb
WHERE name = 'Somerville 311';

UPDATE authorities SET submission_methods =
  '[{"method": "email", "endpoint": "publicworks@cityoflawrence.com", "priority": 1},
    {"method": "phone", "endpoint": "978-620-3090", "priority": 2}]'::jsonb
WHERE name = 'Lawrence DPW';

UPDATE authorities SET submission_methods =
  '[{"method": "email", "endpoint": "highway@cityofhaverhill.com", "priority": 1, "notes": "Haverhill Highway Division"},
    {"method": "phone", "endpoint": "978-374-2390", "priority": 2}]'::jsonb
WHERE name = 'Haverhill DPW';

UPDATE authorities SET submission_methods =
  '[{"method": "email", "endpoint": "Public.Works@framinghamma.gov", "priority": 1},
    {"method": "phone", "endpoint": "508-532-5600", "priority": 2},
    {"method": "web_form", "endpoint": "https://www.framinghamma.gov/1124/Report-a-Concern", "priority": 3}]'::jsonb
WHERE name = 'Framingham DPW';

UPDATE authorities SET submission_methods =
  '[{"method": "email", "endpoint": "rknox@cityofmalden.org", "priority": 1, "notes": "Director Bob Knox (dept-level email not published)"},
    {"method": "phone", "endpoint": "781-397-7160", "priority": 2}]'::jsonb
WHERE name = 'Malden DPW';

UPDATE authorities SET submission_methods =
  '[{"method": "email", "endpoint": "tabreau@taunton-ma.gov", "priority": 1, "notes": "DPW Director (dept-level email not published)"},
    {"method": "phone", "endpoint": "508-821-1000", "priority": 2}]'::jsonb
WHERE name = 'Taunton DPW';

UPDATE authorities SET submission_methods =
  '[{"method": "email", "endpoint": "tmcgivern@medford-ma.gov", "priority": 1, "notes": "DPW Commissioner (dept-level email not published)"},
    {"method": "phone", "endpoint": "781-393-2417", "priority": 2}]'::jsonb
WHERE name = 'Medford DPW';

UPDATE authorities SET submission_methods =
  '[{"method": "email", "endpoint": "revere311@revere.org", "priority": 1, "notes": "Revere 311"},
    {"method": "phone", "endpoint": "781-286-8100", "priority": 2}]'::jsonb
WHERE name = 'Revere DPW';

UPDATE authorities SET submission_methods =
  '[{"method": "email", "endpoint": "dpw@cityofpittsfield.org", "priority": 1},
    {"method": "phone", "endpoint": "413-499-9330", "priority": 2}]'::jsonb
WHERE name = 'Pittsfield DPW';

-- ============================================================
-- RHODE ISLAND — only one verified department email
-- ============================================================

UPDATE authorities SET submission_methods =
  '[{"method": "email", "endpoint": "eprecycle@eastprovidenceri.gov", "priority": 1, "notes": "East Providence Recycling/DPW (only public email)"},
    {"method": "phone", "endpoint": "401-435-7500", "priority": 2}]'::jsonb
WHERE name = 'East Providence DPW';

UPDATE authorities SET submission_methods =
  '[{"method": "email", "endpoint": "bcollins@woonsocketri.org", "priority": 1, "notes": "DPW contact Blake Collins (dept-level email not published)"},
    {"method": "phone", "endpoint": "401-767-9200", "priority": 2}]'::jsonb
WHERE name = 'Woonsocket DPW';

-- ============================================================
-- NEW HAMPSHIRE — two verified department emails
-- ============================================================

UPDATE authorities SET submission_methods =
  '[{"method": "email", "endpoint": "PWInfo@KeeneNH.gov", "priority": 1},
    {"method": "phone", "endpoint": "603-352-6550", "priority": 2}]'::jsonb
WHERE name = 'Keene Public Works';

UPDATE authorities SET submission_methods =
  '[{"method": "email", "endpoint": "publicworks@laconianh.gov", "priority": 1},
    {"method": "phone", "endpoint": "603-528-6379", "priority": 2}]'::jsonb
WHERE name = 'Laconia DPW';

-- ============================================================
-- CONNECTICUT — new entries
-- ============================================================

INSERT INTO authorities (name, level, state, submission_methods) VALUES
('Connecticut DOT', 'state', 'CT',
  '[{"method": "email", "endpoint": "DOT.CustomerCare@ct.gov", "priority": 1, "notes": "CTDOT customer service"},
    {"method": "phone", "endpoint": "860-594-2560", "priority": 2}]'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO authorities (name, level, state, city, submission_methods) VALUES
('Hartford DPW', 'city', 'CT', 'Hartford',
  '[{"method": "web_form", "endpoint": "https://www.hartfordct.gov/Government/Departments/Public-Works/DPW-Staff-Directory", "priority": 1, "notes": "Dept-level email not published"}]'::jsonb),

('New Haven Public Works', 'city', 'CT', 'New Haven',
  '[{"method": "api", "endpoint": "https://seeclickfix.com/api/v2/issues", "priority": 1, "protocol": "seeclickfix", "notes": "New Haven uses SeeClickFix"},
    {"method": "web_form", "endpoint": "https://seeclickfix.com/new-haven", "priority": 2},
    {"method": "phone", "endpoint": "203-946-7700", "priority": 3}]'::jsonb),

('Stamford Office of Operations', 'city', 'CT', 'Stamford',
  '[{"method": "email", "endpoint": "FixIt@stamfordct.gov", "priority": 1, "notes": "Stamford Citizen Service Bureau"},
    {"method": "web_form", "endpoint": "https://www.stamfordct.gov/government/view-all-city-departments/citizen-s-service-bureau", "priority": 2}]'::jsonb),

('Bridgeport Public Facilities', 'city', 'CT', 'Bridgeport',
  '[{"method": "email", "endpoint": "PublicFacilities@bridgeportct.gov", "priority": 1}]'::jsonb),

('Waterbury DPW', 'city', 'CT', 'Waterbury',
  '[{"method": "web_form", "endpoint": "https://www.waterburyct.org/311/request/add", "priority": 1, "notes": "Waterbury 311 portal"}]'::jsonb),

('Norwalk DPW', 'city', 'CT', 'Norwalk',
  '[{"method": "email", "endpoint": "customerservice@norwalkct.gov", "priority": 1}]'::jsonb),

('Danbury CityLine 311', 'city', 'CT', 'Danbury',
  '[{"method": "api", "endpoint": "https://seeclickfix.com/api/v2/issues", "priority": 1, "protocol": "seeclickfix", "notes": "Danbury uses SeeClickFix"},
    {"method": "web_form", "endpoint": "https://en.seeclickfix.com/danbury", "priority": 2},
    {"method": "phone", "endpoint": "203-744-4311", "priority": 3}]'::jsonb),

('New Britain DPW', 'city', 'CT', 'New Britain',
  '[{"method": "web_form", "endpoint": "https://www.newbritainct.gov/contact/form/public-workshtm", "priority": 1}]'::jsonb),

('Meriden Public Works', 'city', 'CT', 'Meriden',
  '[{"method": "email", "endpoint": "publicworks@meridenct.gov", "priority": 1},
    {"method": "phone", "endpoint": "203-630-4018", "priority": 2}]'::jsonb),

('West Hartford DPW', 'town', 'CT', 'West Hartford',
  '[{"method": "email", "endpoint": "WHPublicworks@WestHartfordCT.gov", "priority": 1}]'::jsonb)
ON CONFLICT DO NOTHING;

-- ============================================================
-- MAINE — new entries
-- ============================================================

INSERT INTO authorities (name, level, state, submission_methods) VALUES
('MaineDOT', 'state', 'ME',
  '[{"method": "web_form", "endpoint": "https://www.maine.gov/dot/about/contact", "priority": 1, "notes": "MaineDOT contact form (no dept-level email published)"},
    {"method": "phone", "endpoint": "207-624-3000", "priority": 2}]'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO authorities (name, level, state, city, submission_methods) VALUES
('Portland Public Works', 'city', 'ME', 'Portland',
  '[{"method": "api", "endpoint": "https://seeclickfix.com/api/v2/issues", "priority": 1, "protocol": "seeclickfix", "notes": "Portland uses SeeClickFix"},
    {"method": "web_form", "endpoint": "https://seeclickfix.com/portland_2", "priority": 2},
    {"method": "phone", "endpoint": "207-874-8801", "priority": 3}]'::jsonb),

('Bangor Public Works', 'city', 'ME', 'Bangor',
  '[{"method": "web_form", "endpoint": "https://www.bangormaine.gov/directory.aspx?did=24", "priority": 1, "notes": "Staff directory (dept-level email not published)"}]'::jsonb),

('Lewiston Public Works', 'city', 'ME', 'Lewiston',
  '[{"method": "web_form", "endpoint": "https://www.lewistonmaine.gov/142/Public-Works-Department", "priority": 1, "notes": "Dept-level email not published"}]'::jsonb),

('Augusta Public Works', 'city', 'ME', 'Augusta',
  '[{"method": "email", "endpoint": "info@augustamaine.gov", "priority": 1, "notes": "General city inbox (no DPW-specific email)"},
    {"method": "phone", "endpoint": "207-626-2435", "priority": 2}]'::jsonb),

('South Portland Public Works', 'city', 'ME', 'South Portland',
  '[{"method": "email", "endpoint": "publicworks@southportland.org", "priority": 1}]'::jsonb),

('Auburn Public Works', 'city', 'ME', 'Auburn',
  '[{"method": "email", "endpoint": "sholland@auburnmaine.gov", "priority": 1, "notes": "Director Scott Holland (dept-level email not published)"}]'::jsonb),

('Biddeford Public Works', 'city', 'ME', 'Biddeford',
  '[{"method": "email", "endpoint": "publicworks@biddefordmaine.org", "priority": 1}]'::jsonb)
ON CONFLICT DO NOTHING;

-- ============================================================
-- VERMONT — new entries
-- ============================================================

INSERT INTO authorities (name, level, state, submission_methods) VALUES
('VTrans (Vermont Agency of Transportation)', 'state', 'VT',
  '[{"method": "web_form", "endpoint": "https://vtrans.vermont.gov/contact-us", "priority": 1},
    {"method": "phone", "endpoint": "802-917-2458", "priority": 2}]'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO authorities (name, level, state, city, submission_methods) VALUES
('Burlington DPW', 'city', 'VT', 'Burlington',
  '[{"method": "email", "endpoint": "dpw-pinecustomerservice@burlingtonvt.gov", "priority": 1},
    {"method": "phone", "endpoint": "802-863-9094", "priority": 2}]'::jsonb),

('Montpelier DPW', 'city', 'VT', 'Montpelier',
  '[{"method": "web_form", "endpoint": "https://www.montpelier-vt.org/167/Public-Works", "priority": 1, "notes": "Dept-level email not published"}]'::jsonb),

('Rutland DPW', 'city', 'VT', 'Rutland',
  '[{"method": "email", "endpoint": "bobp@rutlandcity.org", "priority": 1, "notes": "DPW Commissioner Bob Protivansky"}]'::jsonb),

('South Burlington DPW', 'city', 'VT', 'South Burlington',
  '[{"method": "email", "endpoint": "dpw@southburlingtonvt.gov", "priority": 1}]'::jsonb),

('Colchester DPW', 'town', 'VT', 'Colchester',
  '[{"method": "email", "endpoint": "DPW@colchestervt.gov", "priority": 1}]'::jsonb),

('Essex DPW', 'town', 'VT', 'Essex',
  '[{"method": "web_form", "endpoint": "https://www.essexvt.gov/directory.aspx?did=9", "priority": 1, "notes": "Dept-level email not published"}]'::jsonb)
ON CONFLICT DO NOTHING;
