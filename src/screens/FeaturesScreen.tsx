import React from 'react';
import { View, Text, StyleSheet, SectionList } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import Icon from '../components/Icon';
import { FadeIn, StaggeredItem } from '../components/AnimatedComponents';

interface Feature {
  icon: string;
  title: string;
  plain: string;
  technical: string;
}

interface FeatureSection {
  title: string;
  icon: string;
  data: Feature[];
}

const SECTIONS: FeatureSection[] = [
  {
    title: 'Reporting',
    icon: 'camera',
    data: [
      { icon: 'lightning-bolt', title: 'Quick Report (10 seconds)', plain: 'One screen: pick a category, GPS auto-detects location, snap a photo, select hazard level, submit. No forms, no friction.', technical: 'Single-screen flow bypasses the 5-step wizard. Uses expo-location high-accuracy GPS, expo-image-picker for camera, and auto-triggers AI analysis via Supabase Edge Function.' },
      { icon: 'clipboard-text', title: 'Detailed Report (5 steps)', plain: 'Full wizard: choose what\'s wrong, pinpoint on a map, add photos and description, rate severity, review and submit.', technical: '5-step form with category selection, interactive MapView with draggable Marker, expo-image-picker with multi-select, adaptive severity dimensions per category, and review summary.' },
      { icon: 'microphone', title: 'Voice Commands', plain: 'Say "Report pothole" or "Fix this" to start a report without touching the screen. Works while driving.', technical: 'expo-speech-recognition with configurable trigger phrases. Processes on-device speech-to-text, matches against keyword map, navigates to Report screen with prefilled category.' },
      { icon: 'account-voice', title: 'Audio-Guided Mode', plain: 'The app talks you through the entire report: what\'s wrong, how bad, take a photo, confirm, submit. Zero screen interaction needed.', technical: 'AudioGuideSession class using expo-speech for TTS and expo-speech-recognition for STT. State machine (idle → greeting → category → photo → severity → description → confirm → submit). AI analysis integrated mid-flow.' },
      { icon: 'map-marker', title: 'GPS + Draggable Pin', plain: 'Location is auto-detected. A map shows your pin — drag it to the exact spot. Address fills in automatically.', technical: 'expo-location high-accuracy fix → react-native-maps MapView with draggable Marker → expo-location reverseGeocodeAsync for address resolution.' },
      { icon: 'robot', title: 'AI Photo Analysis', plain: 'After you take a photo, AI identifies the issue type, estimates how bad it is, and describes the damage. Auto-fills the form.', technical: 'Photo base64 sent to Supabase Edge Function → Claude Haiku vision API. Returns structured JSON: category, confidence (0-1), size, hazard, dimensions, surface type, weather. Results populate form fields.' },
      { icon: 'camera-enhance', title: 'Smart Photo Coaching', plain: 'The camera shows tips: "Place a shoe next to it for scale. Photograph from 3 feet away." AI then scores your photo quality.', technical: 'Category-specific PhotoGuideline arrays with overlay positioning. Post-capture assessPhotoQuality() scores based on AI confidence, category detection, and dimension estimation.' },
      { icon: 'vibrate', title: 'Bump Detection', plain: 'Your phone detects big jolts while driving and asks "Was that a pothole?" Filters out speed bumps and railroad crossings.', technical: 'expo-sensors Accelerometer at 10Hz. Rolling window of 10 readings filters single jolts. Sustained threshold (1.5G over 3+ readings) plus spike threshold (2.5G) triggers confirmation prompt.' },
      { icon: 'incognito', title: 'Anonymous Reporting', plain: 'No account needed. Report without signing in. Your identity is never attached.', technical: 'Reports insert with user_id = NULL. RLS policy allows anonymous inserts. No session token required for the reports INSERT operation.' },
      { icon: 'cloud-off-outline', title: 'Offline Mode', plain: 'No signal? Reports save locally and auto-submit when you reconnect.', technical: 'AsyncStorage queue with JSON serialization. expo-network monitors connectivity. processQueue() on app foreground iterates pending items through createReport(). Failed items stay queued.' },
      { icon: 'format-list-bulleted', title: '24 Categories', plain: 'Potholes, streetlights, sidewalks, fallen trees, snow/ice, accessibility issues, and 18 more.', technical: 'ReportCategory union type with 24 literals. Each CategoryInfo has severityDimensions array defining which assessment axes apply (size, hazard, urgency, condition).' },
      { icon: 'tune', title: 'Adaptive Severity', plain: 'Each category shows only relevant questions. Potholes ask about size. Streetlights ask about urgency. No irrelevant fields.', technical: 'CategoryInfo.severityDimensions: SeverityType[] determines which picker sections render. ReportSeverity object stores sizeRating?, hazardLevel, urgency?, condition? — nullable fields for non-applicable dimensions.' },
    ],
  },
  {
    title: 'Community',
    icon: 'account-group',
    data: [
      { icon: 'numeric-3-circle', title: 'Three-Report Threshold', plain: 'When 3 different people report the same issue, it becomes "community-verified" — confirmed as real.', technical: 'Postgres trigger assign_report_to_cluster() groups reports by category + 50m PostGIS ST_DWithin radius. Cluster status flips to "confirmed" when unique_reporters >= 3.' },
      { icon: 'bell-ring', title: 'Witness Network', plain: 'When a dangerous issue is reported, nearby users get a push: "Can you verify?" Verification within minutes, not weeks.', technical: 'runWitnessCheck() on app foreground queries reports created < 1hr ago with hazard >= significant, within 500m haversine of user. Sends local notification with report deep link.' },
      { icon: 'thumb-up', title: 'Upvote & Confirm', plain: 'Upvote = "this matters." Confirm = "I\'ve seen it too." Both tracked independently, both boost priority.', technical: 'report_votes table with UNIQUE(report_id, user_id, vote_type). RPC functions increment_upvote/increment_confirm update denormalized counters on reports table.' },
      { icon: 'content-duplicate', title: 'Duplicate Detection', plain: 'If you\'re about to report something that already has reports, the app shows you the existing cluster and asks "Add yours?"', technical: 'Client-side haversine filter on report_clusters within 100m + same category. Shows NearbyCluster[] in a FadeIn warning banner. Selecting a cluster sets existingClusterId on the new report.' },
      { icon: 'bullhorn', title: 'Community Campaigns', plain: 'Create named campaigns like "Fix Elm Street." Set a goal, track progress, share on social media. Organized collective action.', technical: 'campaigns table with creator, target_area (JSONB), goal_reports, current_reports, supporters count. shareCampaign() uses RN Share API with formatted message template.' },
    ],
  },
  {
    title: 'Escalation',
    icon: 'email-fast',
    data: [
      { icon: 'domain', title: 'Auto Authority Identification', plain: 'GPS boundary mapping identifies whether your report goes to the city, county, or state. 42 authorities pre-configured.', technical: 'PostGIS find_authority_by_point() RPC using ST_Contains on boundary_geojson. Fallback chain: GIS boundary → city/state text match → state-level authority.' },
      { icon: 'email-send', title: 'Auto Escalation', plain: 'At 10 reports over 30 days, a professional report is auto-emailed to the responsible authority.', technical: 'Supabase Edge Function escalate-clusters runs on cron. Queries get_clusters_ready_for_escalation() (confirmed + 10 reports + 30 days). Sends via Resend API with get_cluster_summary() data.' },
      { icon: 'api', title: 'Direct 311 / SeeClickFix API', plain: 'For connected cities, reports submit directly into their ticketing system. Real ticket numbers, real tracking.', technical: 'submitOpen311() POSTs to Open311 /requests.json endpoint. submitSeeClickFix() POSTs JSON to SeeClickFix /issues endpoint. Both return external ticket IDs stored as submission_reference.' },
      { icon: 'sync', title: 'Bidirectional Status Sync', plain: 'For API-connected cities, when they update the status in their system, your app updates automatically.', technical: 'batchSyncStatuses() iterates escalation_log entries, calls syncOpen311Status() or syncSeeClickFixStatus() to GET ticket status, maps to internal status enum, updates report_clusters.' },
      { icon: 'alert-octagon', title: 'Emergency Fast-Track', plain: 'Reports rated "extremely dangerous" or "critical urgency" are flagged immediately and prioritized.', technical: 'isEmergencyFastTrack() checks hazardLevel === "extremely_dangerous" || urgency === "critical". UI shows emergencyBanner. Submission alert uses different title/message. Backend threshold bypass planned.' },
    ],
  },
  {
    title: 'Accountability',
    icon: 'gavel',
    data: [
      { icon: 'file-document', title: 'Legal Demand Letters', plain: 'Auto-generates formal notices citing your state\'s specific law. Tracks the deadline. Creates legal exposure for cities that ignore reports.', technical: 'generateDemandLetter() looks up STATE_STATUTES[state] for statute citation, notice period, filing requirements. Calculates daysSinceReport, isOverdue. Outputs formatted letter with report evidence, GPS, photo count.' },
      { icon: 'shield-car', title: 'Insurance Claim Packager', plain: 'One tap generates a timestamped evidence bundle with GPS, photos, timeline, and proof that the authority was notified.', technical: 'generateClaimEvidence() queries report, cluster, escalation_log. Builds TimelineEvent[] chronologically. Outputs ClaimEvidence with fullText (formatted report), mediaUrls, authorityNotification status.' },
      { icon: 'chart-timeline-variant', title: 'Fiscal Impact Projections', plain: '"Fix this for $75 now, or face $12,000 in liability next year." Shows authorities the math.', technical: 'projectFiscalImpact() applies DETERIORATION_RATES[category] (6mo/12mo multipliers) and LIABILITY_CLAIMS[category] (avgClaim × probability × hazardMult × trafficMult). Returns costOfInaction vs currentRepairCost.' },
      { icon: 'timer-sand', title: 'Response Countdown', plain: 'Public timer from notification. Miss the deadline? Everyone who reported gets notified. Milestones at 30/60/90 days.', technical: 'getActiveCommitments() queries submitted clusters, calculates daysElapsed vs DEFAULT_SLAS[category]. checkBrokenPromises() sends notifications when overdueBy hits 1, 30, 60, 90.' },
      { icon: 'hammer-wrench', title: 'Contractor Accountability', plain: 'Tracks repair quality by analyzing re-reports at resolved locations. Grades contractors A-F.', technical: 'getContractorPerformance() grid-clusters resolved reports, checks for re-reports within 180 days at same location. Calculates failureRate, avgRepairLifespan, qualityGrade.' },
      { icon: 'check-decagram', title: 'Repair Verification', plain: 'After a fix, nearby users photograph the result. AI grades it. "Poor" or "Failed" reopens the report.', technical: 'submitRepairVerification() uploads after-photo via uploadMedia(), stores grade in resolved_media JSONB. Grade "poor"/"failed" triggers UPDATE reports SET status = "in_progress", resolved_at = NULL.' },
      { icon: 'timelapse', title: 'Deterioration Timelapse', plain: 'When the same spot is photographed over months, the app builds a visual timeline of neglect. Shareable.', technical: 'getDeterioriationTimelapse() queries cluster_reports → reports with media, builds TimelapseFrame[] sorted by created_at. Calculates daysSinceFirst, cumulative reporterCount per frame.' },
      { icon: 'video-account', title: 'Video Testimonials', plain: 'Record a 15-second video about how the issue affects you. Attached to escalation emails.', technical: 'recordTestimonial() uses expo-image-picker with videoMaxDuration: 15 and UIImagePickerControllerQualityType.Medium. Uploads via uploadMedia(). testimonialsSummary() generates text for escalation emails.' },
    ],
  },
  {
    title: 'Data & Transparency',
    icon: 'chart-bar',
    data: [
      { icon: 'school', title: 'Infrastructure Health Grades', plain: 'Every city gets a live A+ to F grade based on fix rate, response time, severity, and recurrence.', technical: 'getCityHealthScore() computes weighted composite: reportDensity (15%) + fixRate (30%) + responseTime (25%) + severityIndex (15%) + recurrenceRate (15%). scoreToGrade() maps 0-100 to A+ through F.' },
      { icon: 'podium', title: 'Cross-Municipal Shame Index', plain: 'Comparative rankings between neighboring cities. Competitive pressure drives improvement.', technical: 'generateShameIndex() iterates cities, calls getCityHealthScore() + getAggregateCost() for each. Sorts by score, generates shareText with rankings. compareCities() does head-to-head.' },
      { icon: 'vote', title: 'Election District Overlay', plain: 'Maps reports to political districts. See which representatives\' areas have the most unresolved issues.', technical: 'Census Bureau Geocoder API (free, no key): geocoding.geo.census.gov/geocoder/geographies/coordinates. Returns State Legislative Districts, Congressional Districts, Counties.' },
      { icon: 'cash', title: 'Budget Transparency', plain: 'Connects to municipal open data portals. Shows budget allocated vs spent vs problems remaining.', technical: 'getBudgetData() checks budget_data table then OPEN_DATA_SOURCES registry (Boston, Cambridge, Somerville, Providence). getBudgetVsReality() combines budget + costEstimation data.' },
      { icon: 'crystal-ball', title: 'Predictive Analytics', plain: 'Predicts where damage will occur before it happens using historical patterns and seasonal trends.', technical: 'generateLocalPredictions() grid-clusters historical reports (0.002° cells), scores by: repeat count, resolved-then-re-reported, severity trend, seasonal pattern, category-specific risk. Returns PredictionZone[] with risk_score 0-100.' },
      { icon: 'road', title: 'Street Decay Profiles', plain: 'Per-street condition grades with recurrence rates, seasonal patterns, and projected repair timelines.', technical: 'getStreetDecayProfile() queries by ilike address, analyzes recurrenceRate (re-reports within 180d of resolution), severityTrend (recent vs older avgSeverity), seasonal distribution. Outputs decayScore 0-100, probabilityOfMajorRepair.' },
      { icon: 'snowflake', title: 'Seasonal Pre-Deployment', plain: 'Generates reports predicting damage before winter hits, so cities can fix proactively and save 40%.', technical: 'generatePreDeploymentReport() clusters historical reports by location + category + month, identifies multi-year recurrence patterns. Outputs full text report with predicted locations, costs, and FHWA-sourced proactive savings estimate.' },
      { icon: 'newspaper', title: 'Media & Data Pipeline', plain: 'CSV data exports, authority performance reports, and alert subscriptions for journalists.', technical: 'exportReportsCSV() builds CSV from reports query with sanitized fields. exportAuthorityPerformance() generates per-authority metrics. MediaAlert subscription system via AsyncStorage.' },
      { icon: 'currency-usd', title: 'Cost Estimation', plain: 'Every report shows estimated repair cost. Aggregated per city as total deferred maintenance.', technical: 'REPAIR_COSTS lookup by category + HAZARD_MULTIPLIERS by hazardLevel. getAggregateCost() sums across city/state, formats as "$2.3M". Based on FHWA and ASCE average data.' },
    ],
  },
  {
    title: 'Engagement',
    icon: 'gamepad-variant',
    data: [
      { icon: 'fire', title: 'Daily Streaks', plain: 'Report something every day, build your streak. 7-day streak = 50 bonus points. 30-day = 200.', technical: 'AsyncStorage-persisted streak counter. recordReportForStreak() compares lastDate to today/yesterday. Resets on gap > 1 day. Pulse animation on HomeScreen streak badge.' },
      { icon: 'medal', title: 'Points & Badges', plain: '10 points per report, 15 with photo, 25 when resolved. Earn badges for milestones.', technical: 'POINT_VALUES constants. awardPoints() RPC increments profiles.points. Badge system uses JSONB array on profiles table.' },
      { icon: 'trophy', title: 'Leaderboards', plain: 'Global, state, and city rankings. See who\'s making the biggest impact.', technical: 'getLeaderboard() queries profiles ordered by points DESC. Returns LeaderboardEntry[] with rank, displayName, totalReports, totalPoints, badges count.' },
      { icon: 'newspaper-variant', title: 'Neighborhood Feed', plain: 'Real-time activity near you: new reports, resolutions, milestones.', technical: 'getNeighborhoodFeed() combines get_nearby_reports RPC + report_clusters queries. Merges report/resolved/milestone events, sorts by timestamp DESC.' },
      { icon: 'coffee', title: 'Local Business Rewards', plain: 'Local businesses sponsor rewards. Report 10 issues, get a free coffee. Points redeem for real rewards.', technical: 'rewards/claimed_rewards tables. claimReward() validates points, generates FL-XXXXXXXX redemption code, deducts via award_points(-cost). Business partnership model.' },
      { icon: 'calendar-week', title: 'Weekly Digest', plain: 'Every Sunday: reports in your area, issues resolved, authorities that responded.', technical: 'checkWeeklyDigest() fires on Sunday only. Queries reports/resolved counts for last 7 days within user location radius. Sends local notification via community channel.' },
    ],
  },
  {
    title: 'Intelligence',
    icon: 'brain',
    data: [
      { icon: 'car', title: 'Commute Learning', plain: 'Learns your frequent routes. Alerts you about hazards on your commute and reports that need one more confirmation.', technical: 'recordLocationPoint() stores RoutePoint (lat, lng, dayOfWeek, hour) in AsyncStorage (last 500). getFrequentLocations() grid-clusters at 0.005° resolution. checkCommuteReports() matches clusters within 200m of frequent locations.' },
      { icon: 'alert', title: 'Proximity Danger Alerts', plain: 'Approaching a known hazard? Your phone vibrates with a warning: "Pothole 200 feet ahead."', technical: 'startProximityMonitoring() uses Location.watchPositionAsync at 10s intervals + 50m distance. Checks cachedHazards (refreshed every 60s from get_nearby_reports RPC). Filters by minHazardLevel and COOLDOWN_MS per hazard. Haptic + local notification.' },
      { icon: 'bell-badge', title: 'Smart Notifications', plain: 'Context-aware alerts: status changes, escalation milestones, commute hazards, weekly digests. Quiet hours respected.', technical: 'SmartPushPrefs with quietHoursStart/End. isQuietHours() check before every notification. Three Android channels: reports, community, escalations. Supabase Realtime subscriptions for status/vote changes.' },
      { icon: 'cube-scan', title: 'AR Overlay', plain: 'Point your camera at the road. See floating markers showing nearby reports — color-coded by severity.', technical: 'CameraView + Location.watchHeadingAsync. getBearing() calculates azimuth to each report. angleDiff from heading maps to screenX via FOV projection. Marker opacity scales with distance. Tap → navigate to ReportDetail.' },
      { icon: 'map-check', title: 'Offline Maps', plain: 'Cache map tiles for your area so the map works without cell service.', technical: 'downloadRegion() calculates tile coordinates via latLngToTile() for zoom 12-16. Downloads OSM tiles to FileSystem.cacheDirectory. getCachedRegions() tracks metadata in AsyncStorage. ~5-20MB per 5km radius.' },
    ],
  },
  {
    title: 'Accessibility & Language',
    icon: 'wheelchair-accessibility',
    data: [
      { icon: 'translate', title: '5 Languages', plain: 'English, Spanish, Portuguese, Chinese, and Haitian Creole. Auto-detects your device language.', technical: 'i18n-js with 5 locale files (~80 keys each). expo-localization getLocales()[0].languageCode for auto-detection. AsyncStorage persistence for manual override. i18n.enableFallback = true.' },
      { icon: 'eye', title: 'Screen Reader Support', plain: 'Every button and label has proper accessibility descriptions for VoiceOver and TalkBack.', technical: 'accessibilityRole, accessibilityLabel, accessibilityValue props on all interactive components. announce() wrapper for AccessibilityInfo.announceForAccessibility.' },
      { icon: 'format-size', title: 'Dynamic Text Sizing', plain: 'Respects your device\'s text size settings. Everything scales without breaking.', technical: 'scaledFontSize() multiplies baseSize × userPref × PixelRatio.getFontScale(). Layouts use flex rather than fixed heights to accommodate scaled text.' },
      { icon: 'contrast-circle', title: 'High Contrast + Dark Mode', plain: 'Dark mode with system preference detection. High contrast palette for low vision users.', technical: 'ThemeProvider context with useColorScheme() for system detection. DARK_COLORS/LIGHT_COLORS/HIGH_CONTRAST_COLORS palettes. Persisted to AsyncStorage. Three modes: light, dark, system.' },
    ],
  },
  {
    title: 'Security',
    icon: 'shield-lock',
    data: [
      { icon: 'lock', title: 'Zero Client Secrets', plain: 'No API keys or passwords are stored in the app. All sensitive operations happen on the server.', technical: 'Only Supabase publishable key in client (public by design, gated by RLS). Resend, Anthropic, and service role keys exist exclusively in Supabase Edge Function env vars.' },
      { icon: 'speedometer', title: 'Server-Side Rate Limiting', plain: 'Can\'t be bypassed by hacking the app. Database enforces 10 reports per hour per user.', technical: 'Postgres BEFORE INSERT trigger enforce_report_rate_limit() counts reports WHERE user_id = NEW.user_id AND created_at > NOW() - 1hr. Raises exception on >= 10.' },
      { icon: 'bug-check', title: 'Bot Protection', plain: 'Hidden honeypot field catches automated spam bots that fill all form fields.', technical: 'reports._hp column with BEFORE INSERT trigger reject_honeypot(). Real app never populates this field. Bots that auto-fill all fields get P0001 exception.' },
      { icon: 'web', title: 'Domain Whitelist', plain: 'The app only communicates with approved servers. Blocks any unauthorized network requests.', technical: 'createPinnedFetch() wraps global.fetch. Validates URL against allowedDomains whitelist. Enforces HTTPS — rejects http:// (except localhost). Blocks non-whitelisted hostnames.' },
      { icon: 'file-check', title: 'File Validation', plain: 'Uploaded photos are verified to actually be images, not malicious files.', technical: 'validateImageMagicBytes() checks base64 header against JPEG (/9j/), PNG (iVBORw0K), GIF (R0lGOD), WebP (UklGR), BMP (Qk) signatures. 5MB size limit. Content-type enforced on Supabase Storage upload.' },
    ],
  },
];

export default function FeaturesScreen() {
  return (
    <SectionList
      style={styles.container}
      sections={SECTIONS}
      keyExtractor={(item, index) => `${item.title}-${index}`}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={() => (
        <FadeIn style={styles.header}>
          <Icon name="star-four-points" size={32} color={COLORS.primary} />
          <Text style={styles.headerTitle} accessibilityRole="header">All Features</Text>
          <Text style={styles.headerSubtitle}>Everything Fault Line does — in plain language and technical detail.</Text>
        </FadeIn>
      )}
      renderSectionHeader={({ section }) => (
        <FadeIn style={styles.sectionHeader}>
          <Icon name={section.icon} size={22} color={COLORS.primary} />
          <Text style={styles.sectionTitle} accessibilityRole="header">{section.title}</Text>
        </FadeIn>
      )}
      renderItem={({ item, index }) => (
        <StaggeredItem index={index} style={styles.featureCard}>
          <View style={styles.featureHeader}>
            <View style={styles.featureIconWrap}>
              <Icon name={item.icon} size={20} color={COLORS.primary} />
            </View>
            <Text style={styles.featureTitle}>{item.title}</Text>
          </View>
          <Text style={styles.featurePlain}>{item.plain}</Text>
          <View style={styles.techBox}>
            <Text style={styles.techLabel}>Technical</Text>
            <Text style={styles.techText}>{item.technical}</Text>
          </View>
        </StaggeredItem>
      )}
      contentContainerStyle={{ paddingBottom: 80 }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { padding: SPACING.xl, alignItems: 'center', gap: SPACING.sm },
  headerTitle: { fontSize: FONT_SIZES.title, fontWeight: '800', color: COLORS.text },
  headerSubtitle: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary, textAlign: 'center', maxWidth: 300 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.md, paddingTop: SPACING.xl, paddingBottom: SPACING.sm },
  sectionTitle: { fontSize: FONT_SIZES.xl, fontWeight: '800', color: COLORS.text },
  featureCard: { marginHorizontal: SPACING.md, marginBottom: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, ...SHADOWS.sm },
  featureHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  featureIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.primary + '15', justifyContent: 'center', alignItems: 'center' },
  featureTitle: { fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.text, flex: 1 },
  featurePlain: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary, lineHeight: 22, marginBottom: SPACING.sm },
  techBox: { backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md, padding: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  techLabel: { fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.primary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  techText: { fontSize: FONT_SIZES.sm, color: COLORS.textLight, lineHeight: 18, fontFamily: 'monospace' },
});
