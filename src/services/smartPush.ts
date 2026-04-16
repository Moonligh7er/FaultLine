import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sendLocalNotification } from './notifications';
import { supabase } from './supabase';
import { generateNotificationCopy } from './ai';

// ============================================================
// Smart Push Notifications
// Context-aware, location-based, behavior-driven notifications
// ============================================================

const ROUTE_HISTORY_KEY = 'commute_route_history';
const PUSH_PREFS_KEY = 'smart_push_prefs';

interface RoutePoint {
  lat: number;
  lng: number;
  timestamp: string;
  dayOfWeek: number;
  hour: number;
}

interface SmartPushPrefs {
  commuteAlerts: boolean;
  nearbyAlerts: boolean;
  milestoneAlerts: boolean;
  weeklyDigest: boolean;
  quietHoursStart: number; // 0-23
  quietHoursEnd: number;
}

const DEFAULT_PREFS: SmartPushPrefs = {
  commuteAlerts: true,
  nearbyAlerts: true,
  milestoneAlerts: true,
  weeklyDigest: true,
  quietHoursStart: 22,
  quietHoursEnd: 7,
};

export async function getSmartPushPrefs(): Promise<SmartPushPrefs> {
  const raw = await AsyncStorage.getItem(PUSH_PREFS_KEY);
  return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
}

export async function saveSmartPushPrefs(prefs: SmartPushPrefs): Promise<void> {
  await AsyncStorage.setItem(PUSH_PREFS_KEY, JSON.stringify(prefs));
}

function isQuietHours(prefs: SmartPushPrefs): boolean {
  const hour = new Date().getHours();
  if (prefs.quietHoursStart > prefs.quietHoursEnd) {
    // Wraps midnight: e.g., 22-7
    return hour >= prefs.quietHoursStart || hour < prefs.quietHoursEnd;
  }
  return hour >= prefs.quietHoursStart && hour < prefs.quietHoursEnd;
}

// ============================================================
// COMMUTE LEARNING
// Track user's frequent routes to identify relevant reports
// ============================================================

export async function recordLocationPoint(): Promise<void> {
  const { status } = await Location.getForegroundPermissionsAsync();
  if (status !== 'granted') return;

  const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  const now = new Date();

  const point: RoutePoint = {
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    timestamp: now.toISOString(),
    dayOfWeek: now.getDay(),
    hour: now.getHours(),
  };

  const raw = await AsyncStorage.getItem(ROUTE_HISTORY_KEY);
  const history: RoutePoint[] = raw ? JSON.parse(raw) : [];

  history.push(point);

  // Keep last 500 points (~1 week of commute data)
  if (history.length > 500) history.splice(0, history.length - 500);

  await AsyncStorage.setItem(ROUTE_HISTORY_KEY, JSON.stringify(history));
}

// Identify frequent locations (home, work, commute corridors)
async function getFrequentLocations(): Promise<{ lat: number; lng: number; frequency: number }[]> {
  const raw = await AsyncStorage.getItem(ROUTE_HISTORY_KEY);
  if (!raw) return [];

  const history: RoutePoint[] = JSON.parse(raw);
  const gridSize = 0.005; // ~500m cells
  const clusters: Map<string, { lat: number; lng: number; count: number }> = new Map();

  for (const point of history) {
    const key = `${Math.round(point.lat / gridSize)},${Math.round(point.lng / gridSize)}`;
    const existing = clusters.get(key);
    if (existing) {
      existing.count++;
    } else {
      clusters.set(key, { lat: point.lat, lng: point.lng, count: 1 });
    }
  }

  return Array.from(clusters.values())
    .filter((c) => c.count >= 3) // At least 3 visits
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((c) => ({ lat: c.lat, lng: c.lng, frequency: c.count }));
}

// ============================================================
// SMART NOTIFICATION TRIGGERS
// ============================================================

// "You drive past this pothole every morning"
export async function checkCommuteReports(): Promise<void> {
  const prefs = await getSmartPushPrefs();
  if (!prefs.commuteAlerts || isQuietHours(prefs)) return;

  const frequentLocations = await getFrequentLocations();
  if (frequentLocations.length === 0) return;

  for (const loc of frequentLocations.slice(0, 3)) {
    const { data: clusters } = await supabase
      .from('report_clusters')
      .select('id, category, report_count, unique_reporters, status, address, centroid_latitude, centroid_longitude')
      .eq('status', 'confirmed')
      .limit(5);

    if (!clusters) continue;

    for (const cluster of clusters) {
      // Check if near a frequent location
      const dist = haversineM(loc.lat, loc.lng, cluster.centroid_latitude, cluster.centroid_longitude);
      if (dist > 200) continue; // Within 200m of commute

      const neededReports = 10 - cluster.report_count;
      if (neededReports > 0 && neededReports <= 3) {
        await sendLocalNotification(
          'Almost there!',
          `The ${cluster.category?.replace('_', ' ')} near ${cluster.address || 'your route'} needs just ${neededReports} more reports before we contact authorities. You pass by here often!`,
          { clusterId: cluster.id, screen: 'ReportDetail' },
          'community'
        );
        return; // Only one commute alert per check
      }
    }
  }
}

// "X reports near you in the last week"
export async function checkWeeklyDigest(): Promise<void> {
  const prefs = await getSmartPushPrefs();
  if (!prefs.weeklyDigest || isQuietHours(prefs)) return;

  // Only send on Sundays
  if (new Date().getDay() !== 0) return;

  const { status } = await Location.getForegroundPermissionsAsync();
  if (status !== 'granted') return;

  const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });

  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: recent } = await supabase
    .from('reports')
    .select('id')
    .gte('created_at', weekAgo);

  const { data: resolved } = await supabase
    .from('reports')
    .select('id')
    .eq('status', 'resolved')
    .gte('resolved_at', weekAgo);

  const totalNew = recent?.length || 0;
  const totalFixed = resolved?.length || 0;

  if (totalNew > 0 || totalFixed > 0) {
    await sendLocalNotification(
      'Weekly Community Update',
      `This week: ${totalNew} new reports, ${totalFixed} issues resolved in your area. Your community is making progress!`,
      { screen: 'Dashboard' },
      'community'
    );
  }
}

// "Report confirmed — 2 more people and authorities get notified"
export async function checkEscalationProgress(clusterId: string): Promise<void> {
  const prefs = await getSmartPushPrefs();
  if (!prefs.milestoneAlerts || isQuietHours(prefs)) return;

  const { data: cluster } = await supabase
    .from('report_clusters')
    .select('*')
    .eq('id', clusterId)
    .single();

  if (!cluster) return;

  const milestones = [
    { count: 3, message: 'Community verified! This issue is now confirmed.' },
    { count: 7, message: '7 reports! Just 3 more and we escalate to authorities.' },
    { count: 9, message: 'Almost there! 1 more report triggers authority notification.' },
    { count: 10, message: 'Authorities have been notified! Thank you for your persistence.' },
  ];

  const milestone = milestones.find((m) => m.count === cluster.report_count);
  if (milestone) {
    // Try AI-generated copy, fall back to static
    let title = `Milestone: ${cluster.report_count} reports!`;
    let body = milestone.message;

    try {
      const aiCopy = await generateNotificationCopy('escalation_milestone', {
        category: cluster.category,
        address: cluster.address,
        reportCount: cluster.report_count,
        milestone: milestone.message,
      });
      if (aiCopy?.title && aiCopy?.body) {
        title = aiCopy.title;
        body = aiCopy.body;
      }
    } catch {} // Fallback: static copy is already good

    await sendLocalNotification(title, body, { clusterId, screen: 'Dashboard' }, 'community');
  }
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
