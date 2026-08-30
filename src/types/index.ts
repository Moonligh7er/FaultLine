// ============================================================
// Core Types for Fault Line
// ============================================================

// --- Report Types ---

export type ReportCategory =
  // Physical infrastructure — roads / traffic / pedestrian / utilities / environmental / community
  | 'pothole'
  | 'streetlight'
  | 'sidewalk'
  | 'signage'
  | 'drainage'
  | 'graffiti'
  | 'road_debris'
  | 'guardrail'
  | 'crosswalk'
  | 'traffic_signal'
  | 'needed_traffic_light'
  | 'water_main'
  | 'sewer'
  | 'bridge'
  | 'fallen_tree'
  | 'snow_ice'
  | 'accessibility'
  | 'bike_lane'
  | 'abandoned_vehicle'
  | 'illegal_dumping'
  | 'parking_meter'
  | 'park_playground'
  | 'utility_pole'
  // Access & Equity Group A — Physical mobility / ADA (see /access-equity.html)
  | 'missing_curb_cut'
  | 'broken_curb_cut'
  | 'broken_accessibility_ramp'
  | 'ada_blocked_path'
  | 'sidewalk_dead_end'
  | 'broken_aps'
  | 'missing_aps'
  // Group B — Sensory & cognitive access
  | 'missing_braille_signage'
  | 'english_only_signage'
  | 'missing_large_print'
  | 'illegible_signage'
  | 'missing_audible_signage_transit'
  // Group C — Age & vulnerability
  | 'missing_bench_senior_route'
  | 'missing_shade_heat_vulnerable'
  | 'broken_drinking_fountain'
  | 'missing_public_restroom'
  | 'missing_crossing_guard'
  | 'dangerous_school_walk_route'
  // Group D — Housing & shelter equity
  | 'broken_elevator_public_housing'
  | 'broken_heat_ac_public_housing'
  | 'mold_public_housing'
  | 'missing_accessibility_public_housing'
  // Group E — Transit equity
  | 'missing_bus_shelter'
  | 'broken_bus_shelter'
  | 'missing_transit_bench'
  | 'ada_inaccessible_platform'
  | 'broken_wayfinding_transit'
  // Group F — Digital public infrastructure (see /digital-infrastructure.html)
  | 'broken_city_website_form'
  | 'screen_reader_inaccessible_pdf'
  | 'missing_translation'
  | 'city_website_ada_violation'
  | 'missing_plain_language_version'
  | 'missing_captions_official_video'
  | 'broken_mobile_app_accessibility'
  | 'missing_digital_service_equivalent'
  | 'broken_government_email'
  | 'broken_phone_accessibility'
  | 'missing_responsive_design'
  | 'broken_subscription_mechanism'
  | 'other';

export type SizeRating = 'small' | 'medium' | 'large' | 'massive';
export type HazardLevel = 'minor' | 'moderate' | 'significant' | 'dangerous' | 'extremely_dangerous';
export type UrgencyLevel = 'low' | 'medium' | 'high' | 'critical';
export type ConditionLevel = 'cosmetic' | 'deteriorating' | 'broken' | 'destroyed';

// Adaptive severity — each category uses whichever dimensions apply
export type SeverityType = 'size' | 'hazard' | 'urgency' | 'condition';

export type ReportStatus =
  | 'draft'
  | 'submitted'
  | 'acknowledged'
  | 'in_progress'
  | 'resolved'
  | 'closed'
  | 'rejected';

export interface ReportLocation {
  latitude: number;
  longitude: number;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export interface MediaAttachment {
  id: string;
  uri: string;
  type: 'photo' | 'video';
  uploadedUrl?: string;
  thumbnailUrl?: string;
}

export interface VehicleDamage {
  hasDamage: boolean;
  damageType?: ('rim' | 'tire' | 'suspension' | 'alignment' | 'body' | 'other')[];
  description?: string;
  photos?: MediaAttachment[];
}

export interface ReportSeverity {
  sizeRating?: SizeRating;
  hazardLevel: HazardLevel;
  urgency?: UrgencyLevel;
  condition?: ConditionLevel;
}

export interface Report {
  id: string;
  userId?: string;
  category: ReportCategory;
  location: ReportLocation;
  description?: string;
  severity: ReportSeverity;
  media: MediaAttachment[];
  vehicleDamage?: VehicleDamage;
  status: ReportStatus;
  authorityId?: string;
  clusterId?: string;
  submissionMethod?: 'email' | 'api' | '311' | 'manual';
  submissionReference?: string;
  upvoteCount: number;
  confirmCount: number;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  resolvedMedia?: MediaAttachment[]; // before/after
  isAnonymous: boolean;
  sensorDetected: boolean;
  offlineQueued: boolean;
  isQuickReport: boolean;
}

// --- Authority Types ---

export type AuthorityLevel = 'federal' | 'state' | 'county' | 'city' | 'town';
export type SubmissionMethod = 'email' | 'api' | 'web_form' | 'phone' | 'app';

export interface Authority {
  id: string;
  name: string;
  level: AuthorityLevel;
  state: string;
  city?: string;
  county?: string;
  submissionMethods: AuthoritySubmissionMethod[];
  boundaryGeoJson?: object;
  responseTimeAvgDays?: number;
  fixRatePercent?: number;
  isActive: boolean;
}

export interface AuthoritySubmissionMethod {
  method: SubmissionMethod;
  endpoint: string;
  priority: number;
  notes?: string;
  requiresAuth?: boolean;
}

// --- User Types ---

export interface UserProfile {
  id: string;
  email?: string;
  displayName?: string;
  avatarUrl?: string;
  totalReports: number;
  totalUpvotes: number;
  totalConfirms: number;
  points: number;
  badges: Badge[];
  createdAt: string;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  earnedAt: string;
}

// --- Metrics Types ---

export interface AuthorityMetrics {
  authorityId: string;
  authorityName: string;
  totalReports: number;
  resolvedReports: number;
  avgResponseTimeDays: number;
  fixRatePercent: number;
  period: string;
}

export interface AreaMetrics {
  state: string;
  city?: string;
  totalReports: number;
  resolvedReports: number;
  topCategories: { category: ReportCategory; count: number }[];
  hotspots: ReportLocation[];
}

// --- Navigation Types ---

export type RootTabParamList = {
  Home: undefined;
  Report: { prefillCategory?: ReportCategory; sensorTriggered?: boolean; quickMode?: boolean; existingClusterId?: string } | undefined;
  Map: { focusReport?: string } | undefined;
  Dashboard: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  MainTabs: undefined;
  ReportDetail: { reportId: string };
  ARView: undefined;
  Onboarding: undefined;
  PrivacyPolicy: undefined;
  TermsOfService: undefined;
  Features: undefined;
  Feedback: undefined;
};
