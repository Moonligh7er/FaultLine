-- ============================================================
-- Seed Data: Authorities for MA, RI, NH
-- ============================================================

-- MASSACHUSETTS --

-- State level
INSERT INTO authorities (name, level, state, submission_methods) VALUES
('MassDOT (Massachusetts Department of Transportation)', 'state', 'MA',
  '[{"method": "email", "endpoint": "MassDOTinfo@dot.state.ma.us", "priority": 1, "notes": "State highways and interstates"},
    {"method": "phone", "endpoint": "857-368-4636", "priority": 2, "notes": "MassDOT Highway Division"}]');

-- Major cities
INSERT INTO authorities (name, level, state, city, submission_methods) VALUES
('Boston 311', 'city', 'MA', 'Boston',
  '[{"method": "api", "endpoint": "https://311.boston.gov/open311/v2/requests.json", "priority": 1, "notes": "Open311 API"},
    {"method": "web_form", "endpoint": "https://311.boston.gov/", "priority": 2, "notes": "Boston 311 portal"},
    {"method": "phone", "endpoint": "311", "priority": 3}]'),

('Cambridge SeeClickFix', 'city', 'MA', 'Cambridge',
  '[{"method": "api", "endpoint": "https://seeclickfix.com/api/v2/issues", "priority": 1, "notes": "SeeClickFix API"},
    {"method": "web_form", "endpoint": "https://seeclickfix.com/cambridge", "priority": 2}]'),

('Worcester DPW', 'city', 'MA', 'Worcester',
  '[{"method": "web_form", "endpoint": "https://www.worcesterma.gov/dpw/report-a-problem", "priority": 1},
    {"method": "phone", "endpoint": "508-929-1300", "priority": 2}]'),

('Springfield DPW', 'city', 'MA', 'Springfield',
  '[{"method": "phone", "endpoint": "413-736-3111", "priority": 1},
    {"method": "email", "endpoint": "311@springfieldcityhall.com", "priority": 2}]'),

('Lowell DPW', 'city', 'MA', 'Lowell',
  '[{"method": "phone", "endpoint": "978-674-4111", "priority": 1},
    {"method": "web_form", "endpoint": "https://www.lowellma.gov/FormCenter/DPW-7/DPW-Request-Form-53", "priority": 2}]'),

('Brockton DPW', 'city', 'MA', 'Brockton',
  '[{"method": "phone", "endpoint": "508-580-7890", "priority": 1}]'),

('New Bedford DPW', 'city', 'MA', 'New Bedford',
  '[{"method": "phone", "endpoint": "508-979-1550", "priority": 1},
    {"method": "web_form", "endpoint": "https://www.newbedford-ma.gov/public-infrastructure/report-a-problem/", "priority": 2}]'),

('Fall River DPW', 'city', 'MA', 'Fall River',
  '[{"method": "phone", "endpoint": "508-324-2600", "priority": 1}]'),

('Lynn DPW', 'city', 'MA', 'Lynn',
  '[{"method": "phone", "endpoint": "781-268-8000", "priority": 1}]'),

('Quincy DPW', 'city', 'MA', 'Quincy',
  '[{"method": "phone", "endpoint": "617-376-1914", "priority": 1},
    {"method": "web_form", "endpoint": "https://www.quincyma.gov/Government/DPW/default.htm", "priority": 2}]'),

('Somerville 311', 'city', 'MA', 'Somerville',
  '[{"method": "web_form", "endpoint": "https://www.somervillema.gov/departments/311", "priority": 1},
    {"method": "phone", "endpoint": "311", "priority": 2}]'),

('Lawrence DPW', 'city', 'MA', 'Lawrence',
  '[{"method": "phone", "endpoint": "978-620-3090", "priority": 1}]'),

('Haverhill DPW', 'city', 'MA', 'Haverhill',
  '[{"method": "phone", "endpoint": "978-374-2390", "priority": 1}]'),

('Framingham DPW', 'city', 'MA', 'Framingham',
  '[{"method": "phone", "endpoint": "508-532-5600", "priority": 1},
    {"method": "web_form", "endpoint": "https://www.framinghamma.gov/1124/Report-a-Concern", "priority": 2}]'),

('Malden DPW', 'city', 'MA', 'Malden',
  '[{"method": "phone", "endpoint": "781-397-7160", "priority": 1}]'),

('Taunton DPW', 'city', 'MA', 'Taunton',
  '[{"method": "phone", "endpoint": "508-821-1000", "priority": 1}]'),

('Medford DPW', 'city', 'MA', 'Medford',
  '[{"method": "phone", "endpoint": "781-393-2417", "priority": 1}]'),

('Chicopee DPW', 'city', 'MA', 'Chicopee',
  '[{"method": "phone", "endpoint": "413-594-3577", "priority": 1}]'),

('Weymouth DPW', 'town', 'MA', 'Weymouth',
  '[{"method": "phone", "endpoint": "781-337-5100", "priority": 1}]'),

('Revere DPW', 'city', 'MA', 'Revere',
  '[{"method": "phone", "endpoint": "781-286-8100", "priority": 1}]'),

('Peabody DPW', 'city', 'MA', 'Peabody',
  '[{"method": "phone", "endpoint": "978-538-5930", "priority": 1}]'),

('Pittsfield DPW', 'city', 'MA', 'Pittsfield',
  '[{"method": "phone", "endpoint": "413-499-9330", "priority": 1}]'),

('Attleboro DPW', 'city', 'MA', 'Attleboro',
  '[{"method": "phone", "endpoint": "508-223-2222", "priority": 1}]'),

('Waltham DPW', 'city', 'MA', 'Waltham',
  '[{"method": "phone", "endpoint": "781-314-3800", "priority": 1}]'),

('Salem DPW', 'city', 'MA', 'Salem',
  '[{"method": "phone", "endpoint": "978-745-0195", "priority": 1}]');

-- RHODE ISLAND --

INSERT INTO authorities (name, level, state, submission_methods) VALUES
('RIDOT (Rhode Island Department of Transportation)', 'state', 'RI',
  '[{"method": "web_form", "endpoint": "https://www.dot.ri.gov/about/contactus.php", "priority": 1},
    {"method": "phone", "endpoint": "401-222-2450", "priority": 2, "notes": "RIDOT main line"}]');

INSERT INTO authorities (name, level, state, city, submission_methods) VALUES
('Providence 311', 'city', 'RI', 'Providence',
  '[{"method": "web_form", "endpoint": "https://www.providenceri.gov/311/", "priority": 1},
    {"method": "phone", "endpoint": "311", "priority": 2}]'),

('Warwick DPW', 'city', 'RI', 'Warwick',
  '[{"method": "phone", "endpoint": "401-738-2000", "priority": 1}]'),

('Cranston DPW', 'city', 'RI', 'Cranston',
  '[{"method": "phone", "endpoint": "401-780-3166", "priority": 1}]'),

('Pawtucket DPW', 'city', 'RI', 'Pawtucket',
  '[{"method": "phone", "endpoint": "401-728-0500", "priority": 1}]'),

('East Providence DPW', 'city', 'RI', 'East Providence',
  '[{"method": "phone", "endpoint": "401-435-7500", "priority": 1}]'),

('Woonsocket DPW', 'city', 'RI', 'Woonsocket',
  '[{"method": "phone", "endpoint": "401-767-9200", "priority": 1}]'),

('Newport DPW', 'city', 'RI', 'Newport',
  '[{"method": "phone", "endpoint": "401-845-5800", "priority": 1}]');

-- NEW HAMPSHIRE --

INSERT INTO authorities (name, level, state, submission_methods) VALUES
('NHDOT (New Hampshire Department of Transportation)', 'state', 'NH',
  '[{"method": "phone", "endpoint": "603-271-3734", "priority": 1, "notes": "NHDOT Bureau of Highway Maintenance"},
    {"method": "web_form", "endpoint": "https://www.nh.gov/dot/org/operations/highwaymaintenance/index.htm", "priority": 2}]');

INSERT INTO authorities (name, level, state, city, submission_methods) VALUES
('Manchester Highway Department', 'city', 'NH', 'Manchester',
  '[{"method": "phone", "endpoint": "603-624-6444", "priority": 1}]'),

('Nashua DPW', 'city', 'NH', 'Nashua',
  '[{"method": "phone", "endpoint": "603-589-3120", "priority": 1},
    {"method": "web_form", "endpoint": "https://www.nashuanh.gov/FormCenter/DPW-7/Street-Maintenance-Request-55", "priority": 2}]'),

('Concord General Services', 'city', 'NH', 'Concord',
  '[{"method": "phone", "endpoint": "603-225-8520", "priority": 1}]'),

('Dover DPW', 'city', 'NH', 'Dover',
  '[{"method": "phone", "endpoint": "603-516-6450", "priority": 1}]'),

('Rochester DPW', 'city', 'NH', 'Rochester',
  '[{"method": "phone", "endpoint": "603-332-4096", "priority": 1}]'),

('Keene Public Works', 'city', 'NH', 'Keene',
  '[{"method": "phone", "endpoint": "603-352-6550", "priority": 1}]'),

('Portsmouth DPW', 'city', 'NH', 'Portsmouth',
  '[{"method": "phone", "endpoint": "603-427-1530", "priority": 1}]'),

('Laconia DPW', 'city', 'NH', 'Laconia',
  '[{"method": "phone", "endpoint": "603-528-6379", "priority": 1}]');
