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
