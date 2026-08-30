import { ReportCategory, SeverityType, SizeRating, HazardLevel, UrgencyLevel, ConditionLevel } from '../types';

export interface CategoryInfo {
  key: ReportCategory;
  label: string;
  icon: string; // MaterialCommunityIcons name
  description: string;
  severityDimensions: SeverityType[]; // which severity axes apply
  quickReportEnabled: boolean; // show in quick-report grid
}

export const CATEGORIES: CategoryInfo[] = [
  // Infrastructure - Roads
  { key: 'pothole', label: 'Pothole', icon: 'road-variant', description: 'Road surface holes and craters', severityDimensions: ['size', 'hazard'], quickReportEnabled: true },
  { key: 'road_debris', label: 'Road Debris', icon: 'alert-octagon', description: 'Debris or obstacles on roadways', severityDimensions: ['hazard', 'urgency'], quickReportEnabled: true },
  { key: 'guardrail', label: 'Guardrail', icon: 'boom-gate', description: 'Damaged or missing guardrails', severityDimensions: ['condition', 'hazard'], quickReportEnabled: false },
  { key: 'bridge', label: 'Bridge', icon: 'bridge', description: 'Bridge damage or safety concerns', severityDimensions: ['condition', 'hazard'], quickReportEnabled: false },

  // Infrastructure - Traffic
  { key: 'traffic_signal', label: 'Traffic Signal', icon: 'traffic-light', description: 'Malfunctioning traffic lights', severityDimensions: ['urgency', 'hazard'], quickReportEnabled: true },
  { key: 'needed_traffic_light', label: 'Needed Light', icon: 'traffic-light-outline', description: 'Intersection that needs a new traffic light', severityDimensions: ['hazard', 'urgency'], quickReportEnabled: false },
  { key: 'signage', label: 'Signage', icon: 'sign-direction', description: 'Missing, damaged, or obscured signs', severityDimensions: ['condition', 'hazard'], quickReportEnabled: false },
  { key: 'crosswalk', label: 'Crosswalk', icon: 'walk', description: 'Faded or missing crosswalk markings', severityDimensions: ['condition', 'hazard'], quickReportEnabled: false },

  // Infrastructure - Pedestrian & Bike
  { key: 'sidewalk', label: 'Sidewalk', icon: 'human-handsdown', description: 'Cracked or damaged sidewalks', severityDimensions: ['size', 'hazard'], quickReportEnabled: true },
  { key: 'bike_lane', label: 'Bike Lane', icon: 'bicycle', description: 'Obstructed, faded, or missing bike infrastructure', severityDimensions: ['condition', 'hazard'], quickReportEnabled: false },
  { key: 'accessibility', label: 'Accessibility', icon: 'wheelchair-accessibility', description: 'Missing curb cuts, broken ramps, blocked ADA paths', severityDimensions: ['condition', 'urgency'], quickReportEnabled: false },

  // Infrastructure - Utilities
  { key: 'streetlight', label: 'Streetlight', icon: 'lightbulb-outline', description: 'Broken or flickering streetlights', severityDimensions: ['urgency', 'hazard'], quickReportEnabled: true },
  { key: 'water_main', label: 'Water Main', icon: 'water', description: 'Water main breaks or leaks', severityDimensions: ['urgency', 'hazard'], quickReportEnabled: true },
  { key: 'sewer', label: 'Sewer', icon: 'pipe-leak', description: 'Sewer issues or manhole problems', severityDimensions: ['urgency', 'hazard'], quickReportEnabled: false },
  { key: 'utility_pole', label: 'Utility Pole', icon: 'transmission-tower', description: 'Leaning poles, downed or low-hanging wires', severityDimensions: ['hazard', 'urgency'], quickReportEnabled: false },
  { key: 'drainage', label: 'Drainage', icon: 'waves', description: 'Blocked drains or flooding issues', severityDimensions: ['urgency', 'hazard'], quickReportEnabled: false },

  // Environmental & Seasonal
  { key: 'fallen_tree', label: 'Fallen Tree', icon: 'tree', description: 'Fallen trees or hazardous branches blocking roads or paths', severityDimensions: ['hazard', 'urgency'], quickReportEnabled: true },
  { key: 'snow_ice', label: 'Snow / Ice', icon: 'snowflake', description: 'Unplowed roads, icy sidewalks, snow removal needed', severityDimensions: ['hazard', 'urgency'], quickReportEnabled: true },

  // Community & Aesthetic
  { key: 'graffiti', label: 'Graffiti', icon: 'spray', description: 'Unwanted graffiti or vandalism', severityDimensions: ['condition'], quickReportEnabled: false },
  { key: 'illegal_dumping', label: 'Illegal Dumping', icon: 'delete-variant', description: 'Tires, mattresses, construction waste on public land', severityDimensions: ['size', 'hazard'], quickReportEnabled: false },
  { key: 'abandoned_vehicle', label: 'Abandoned Vehicle', icon: 'car-off', description: 'Vehicle left abandoned on public property', severityDimensions: ['urgency'], quickReportEnabled: false },
  { key: 'parking_meter', label: 'Parking Meter', icon: 'meter-electric', description: 'Broken meters or faded lot lines', severityDimensions: ['condition'], quickReportEnabled: false },
  { key: 'park_playground', label: 'Park / Playground', icon: 'seesaw', description: 'Broken equipment, unsafe surfaces in public parks', severityDimensions: ['condition', 'hazard'], quickReportEnabled: false },

  // ══════════════════════════════════════════════════════════════════════════
  // Access & Equity Group A — Physical mobility / ADA
  // See /access-equity.html for routing and legal framework.
  // ══════════════════════════════════════════════════════════════════════════
  { key: 'missing_curb_cut', label: 'Missing Curb Cut', icon: 'wheelchair-accessibility', description: 'No accessible curb cut at intersection where ADA requires one', severityDimensions: ['urgency', 'hazard'], quickReportEnabled: true },
  { key: 'broken_curb_cut', label: 'Broken Curb Cut', icon: 'wheelchair-accessibility', description: 'Curb cut damaged, non-compliant slope, or crumbling surface', severityDimensions: ['condition', 'hazard'], quickReportEnabled: false },
  { key: 'broken_accessibility_ramp', label: 'Broken Access Ramp', icon: 'stairs-up', description: 'Wheelchair ramp damaged, non-compliant, or blocked', severityDimensions: ['condition', 'hazard'], quickReportEnabled: false },
  { key: 'ada_blocked_path', label: 'ADA-Blocked Path', icon: 'block-helper', description: 'Sidewalk or accessible path permanently obstructed (planter, mailbox, construction)', severityDimensions: ['hazard', 'urgency'], quickReportEnabled: true },
  { key: 'sidewalk_dead_end', label: 'Sidewalk Dead-End', icon: 'road-variant', description: 'Sidewalk ends abruptly, creating a mobility trap with no accessible alternative', severityDimensions: ['hazard', 'urgency'], quickReportEnabled: false },
  { key: 'broken_aps', label: 'Broken Accessible Signal', icon: 'traffic-light-outline', description: 'Accessible Pedestrian Signal (audible + vibrotactile) not functioning', severityDimensions: ['urgency', 'hazard'], quickReportEnabled: false },
  { key: 'missing_aps', label: 'Missing Accessible Signal', icon: 'traffic-light-outline', description: 'High-risk intersection lacks required Accessible Pedestrian Signal', severityDimensions: ['hazard', 'urgency'], quickReportEnabled: false },

  // ══════════════════════════════════════════════════════════════════════════
  // Access & Equity Group B — Sensory & cognitive access
  // ══════════════════════════════════════════════════════════════════════════
  { key: 'missing_braille_signage', label: 'Missing Braille Signage', icon: 'sign-text', description: 'Signage required to be tactile / braille under 2010 ADA Standards is missing', severityDimensions: ['condition', 'urgency'], quickReportEnabled: false },
  { key: 'english_only_signage', label: 'English-Only Signage', icon: 'translate', description: 'Public-service signage in English only where community demographics require translation (Title VI + EO 13166)', severityDimensions: ['urgency'], quickReportEnabled: false },
  { key: 'missing_large_print', label: 'Missing Large-Print', icon: 'format-size', description: 'Public-facing signage or forms lack large-print alternatives for low-vision access', severityDimensions: ['condition', 'urgency'], quickReportEnabled: false },
  { key: 'illegible_signage', label: 'Illegible Signage', icon: 'sign-caution', description: 'Sign is faded, damaged, or fails contrast requirements for visual readability', severityDimensions: ['condition', 'hazard'], quickReportEnabled: false },
  { key: 'missing_audible_signage_transit', label: 'Missing Audible Signage', icon: 'volume-off', description: 'Transit hub or platform lacks audible wayfinding for blind / low-vision passengers', severityDimensions: ['hazard', 'urgency'], quickReportEnabled: false },

  // ══════════════════════════════════════════════════════════════════════════
  // Access & Equity Group C — Age & vulnerability
  // ══════════════════════════════════════════════════════════════════════════
  { key: 'missing_bench_senior_route', label: 'Missing Bench (Senior Route)', icon: 'seat', description: 'No seating along a route between senior housing and community services / transit', severityDimensions: ['urgency'], quickReportEnabled: false },
  { key: 'missing_shade_heat_vulnerable', label: 'Missing Shade', icon: 'weather-sunny', description: 'No shade in heat-vulnerable neighborhood; public health / climate-adaptation concern', severityDimensions: ['urgency'], quickReportEnabled: false },
  { key: 'broken_drinking_fountain', label: 'Broken Drinking Fountain', icon: 'water', description: 'Public drinking fountain non-functional; heat-safety concern', severityDimensions: ['condition', 'urgency'], quickReportEnabled: false },
  { key: 'missing_public_restroom', label: 'Missing / Closed Restroom', icon: 'toilet', description: 'Public restroom absent, closed, or inaccessible during posted hours', severityDimensions: ['urgency'], quickReportEnabled: false },
  { key: 'missing_crossing_guard', label: 'Missing Crossing Guard', icon: 'account-alert', description: 'School-zone crossing lacks required crossing guard during school hours', severityDimensions: ['hazard', 'urgency'], quickReportEnabled: true },
  { key: 'dangerous_school_walk_route', label: 'Dangerous School Route', icon: 'school', description: 'School walk-route has hazardous conditions (missing sidewalk, dangerous crossing, no lighting)', severityDimensions: ['hazard', 'urgency'], quickReportEnabled: false },

  // ══════════════════════════════════════════════════════════════════════════
  // Access & Equity Group D — Housing & shelter equity
  // Federal complaint pathway available via HUD in addition to local PHA.
  // ══════════════════════════════════════════════════════════════════════════
  { key: 'broken_elevator_public_housing', label: 'Broken Elevator (Public Housing)', icon: 'elevator', description: 'Elevator in public housing non-functional; disability & elder-mobility crisis', severityDimensions: ['urgency', 'hazard'], quickReportEnabled: true },
  { key: 'broken_heat_ac_public_housing', label: 'Broken Heat/AC (Public Housing)', icon: 'thermometer', description: 'Heating or cooling failure in public housing crossing safety threshold', severityDimensions: ['urgency', 'hazard'], quickReportEnabled: false },
  { key: 'mold_public_housing', label: 'Mold (Public Housing)', icon: 'mushroom-outline', description: 'Mold or habitability failure in public housing violating HUD Housing Quality Standards', severityDimensions: ['hazard', 'urgency'], quickReportEnabled: false },
  { key: 'missing_accessibility_public_housing', label: 'Missing Accessibility (Public Housing)', icon: 'wheelchair-accessibility', description: 'Public housing unit lacks required accessibility feature (grab bar, ramp, roll-in shower) under Section 504', severityDimensions: ['urgency', 'condition'], quickReportEnabled: false },

  // ══════════════════════════════════════════════════════════════════════════
  // Access & Equity Group E — Transit equity
  // Transit authorities are quasi-public; routing separate from municipal government.
  // ══════════════════════════════════════════════════════════════════════════
  { key: 'missing_bus_shelter', label: 'Missing Bus Shelter', icon: 'bus-stop', description: 'High-ridership bus stop lacks shelter for weather protection', severityDimensions: ['urgency'], quickReportEnabled: false },
  { key: 'broken_bus_shelter', label: 'Broken Bus Shelter', icon: 'bus-stop', description: 'Bus shelter damaged, exposed to heat/cold, missing walls or roof', severityDimensions: ['condition', 'urgency'], quickReportEnabled: false },
  { key: 'missing_transit_bench', label: 'Missing Transit Bench', icon: 'seat-recline-extra', description: 'Transit stop lacks seating for elder / disabled / long-wait passengers', severityDimensions: ['urgency'], quickReportEnabled: false },
  { key: 'ada_inaccessible_platform', label: 'ADA-Inaccessible Platform', icon: 'train', description: 'Transit platform, boarding area, or vehicle non-compliant with 49 CFR Part 37', severityDimensions: ['hazard', 'urgency'], quickReportEnabled: false },
  { key: 'broken_wayfinding_transit', label: 'Broken Wayfinding (Transit)', icon: 'sign-direction', description: 'Transit hub signage, maps, or directional aids broken, missing, or non-compliant', severityDimensions: ['condition', 'urgency'], quickReportEnabled: false },

  // ══════════════════════════════════════════════════════════════════════════
  // Access & Equity Group F — Digital public infrastructure
  // See /digital-infrastructure.html. DOJ 2024 rule made these ADA Title II violations.
  // ══════════════════════════════════════════════════════════════════════════
  { key: 'broken_city_website_form', label: 'Broken City Form', icon: 'form-select', description: 'Municipal website form cannot be submitted; assistive-tech users blocked from a public service', severityDimensions: ['urgency', 'hazard'], quickReportEnabled: false },
  { key: 'screen_reader_inaccessible_pdf', label: 'Inaccessible PDF', icon: 'file-pdf-box', description: 'Public PDF is untagged, image-only, or otherwise unreadable by screen readers', severityDimensions: ['urgency'], quickReportEnabled: false },
  { key: 'missing_translation', label: 'Missing Translation', icon: 'translate', description: 'Public information (physical signage or digital) available only in English where translation is legally or demographically required', severityDimensions: ['urgency'], quickReportEnabled: false },
  { key: 'city_website_ada_violation', label: 'City Website ADA Violation', icon: 'web', description: 'Municipal website violates WCAG 2.1 AA (missing alt text, low contrast, keyboard traps, missing focus indicators)', severityDimensions: ['urgency', 'condition'], quickReportEnabled: false },
  { key: 'missing_plain_language_version', label: 'No Plain-Language Version', icon: 'book-open-page-variant', description: 'Important public form or notice uses jargon-heavy or high-reading-level language without accessible alternative', severityDimensions: ['urgency'], quickReportEnabled: false },
  { key: 'missing_captions_official_video', label: 'Missing Captions', icon: 'closed-caption', description: 'Official government video lacks captions or transcript (council meetings, PSAs, mayor communications)', severityDimensions: ['urgency'], quickReportEnabled: false },
  { key: 'broken_mobile_app_accessibility', label: 'Broken App Accessibility', icon: 'cellphone', description: 'Official municipal mobile app fails assistive-tech integration (VoiceOver, TalkBack); unlabeled controls', severityDimensions: ['urgency', 'condition'], quickReportEnabled: false },
  { key: 'missing_digital_service_equivalent', label: 'No Digital Equivalent', icon: 'monitor-off', description: 'In-person service closed with no digital replacement; residents with mobility barriers locked out entirely', severityDimensions: ['urgency', 'hazard'], quickReportEnabled: false },
  { key: 'broken_government_email', label: 'Broken Gov Email', icon: 'email-alert', description: 'Official municipal email address bouncing; contact form replies never acknowledged; official notifications land in spam', severityDimensions: ['urgency'], quickReportEnabled: false },
  { key: 'broken_phone_accessibility', label: 'Broken Phone Access', icon: 'phone-alert', description: 'Municipal phone tree lacks TTY / relay menu; option timing incompatible with cognitive disability', severityDimensions: ['urgency', 'hazard'], quickReportEnabled: false },
  { key: 'missing_responsive_design', label: 'Not Mobile-Accessible', icon: 'cellphone-off', description: 'Public site or form is desktop-only in a demographic where residents are mobile-only for internet access', severityDimensions: ['urgency'], quickReportEnabled: false },
  { key: 'broken_subscription_mechanism', label: 'Broken Notification System', icon: 'rss', description: 'Public notice RSS, email subscription, or emergency-alert enrollment broken or hidden', severityDimensions: ['urgency', 'hazard'], quickReportEnabled: false },

  // Catch-all
  { key: 'other', label: 'Other', icon: 'clipboard-text', description: 'Other infrastructure issues', severityDimensions: ['hazard', 'urgency'], quickReportEnabled: false },
];

export const QUICK_CATEGORIES = CATEGORIES.filter((c) => c.quickReportEnabled);

export const SIZE_RATINGS: { key: SizeRating; label: string; description: string }[] = [
  { key: 'small', label: 'Small', description: 'Smaller than a dinner plate' },
  { key: 'medium', label: 'Medium', description: 'Dinner plate to bicycle wheel' },
  { key: 'large', label: 'Large', description: 'Bicycle wheel to car tire' },
  { key: 'massive', label: 'Massive', description: 'Larger than a car tire' },
];

export const HAZARD_LEVELS: { key: HazardLevel; label: string; color: string }[] = [
  { key: 'minor', label: 'Minor', color: '#4CAF50' },
  { key: 'moderate', label: 'Moderate', color: '#FFC107' },
  { key: 'significant', label: 'Significant', color: '#FF9800' },
  { key: 'dangerous', label: 'Dangerous', color: '#F44336' },
  { key: 'extremely_dangerous', label: 'Extremely Dangerous', color: '#9C27B0' },
];

export const URGENCY_LEVELS: { key: UrgencyLevel; label: string; color: string }[] = [
  { key: 'low', label: 'Low', color: '#4CAF50' },
  { key: 'medium', label: 'Medium', color: '#FFC107' },
  { key: 'high', label: 'High', color: '#FF9800' },
  { key: 'critical', label: 'Critical', color: '#F44336' },
];

export const CONDITION_LEVELS: { key: ConditionLevel; label: string; color: string }[] = [
  { key: 'cosmetic', label: 'Cosmetic', color: '#4CAF50' },
  { key: 'deteriorating', label: 'Deteriorating', color: '#FFC107' },
  { key: 'broken', label: 'Broken', color: '#FF9800' },
  { key: 'destroyed', label: 'Destroyed', color: '#F44336' },
];
