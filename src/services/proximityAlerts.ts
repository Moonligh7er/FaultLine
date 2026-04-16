import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { sendLocalNotification } from './notifications';
import { CATEGORIES, HAZARD_LEVELS } from '../constants/categories';

// ============================================================
// Proximity Danger Alerts
// Vibrate + audio alert when user approaches a known hazard.
// Passive safety warnings from the community report database.
// ============================================================

const PROXIMITY_PREFS_KEY = 'proximity_alert_prefs';
const ALERT_COOLDOWN_KEY = 'proximity_alert_cooldowns';
const CHECK_INTERVAL_MS = 10000; // Check every 10 seconds
const ALERT_RADIUS_M = 200; // Alert within 200 meters
const COOLDOWN_MS = 300000; // Don't re-alert same hazard for 5 minutes

export interface ProximityPrefs {
  enabled: boolean;
  alertRadius: number; // meters
  minHazardLevel: string; // only alert for this severity and above
  vibrate: boolean;
  sound: boolean;
}

const DEFAULT_PREFS: ProximityPrefs = {
  enabled: true,
  alertRadius: 200,
  minHazardLevel: 'significant', // only significant, dangerous, extremely_dangerous
  vibrate: true,
  sound: true,
};

let watchSubscription: Location.LocationSubscription | null = null;
let cachedHazards: { id: string; lat: number; lng: number; category: string; hazard: string; address: string }[] = [];
let lastCacheTime = 0;
const CACHE_DURATION_MS = 60000; // Refresh hazard cache every 60s

export async function getProximityPrefs(): Promise<ProximityPrefs> {
  const raw = await AsyncStorage.getItem(PROXIMITY_PREFS_KEY);
  return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
}

export async function saveProximityPrefs(prefs: ProximityPrefs): Promise<void> {
  await AsyncStorage.setItem(PROXIMITY_PREFS_KEY, JSON.stringify(prefs));
}

// Start monitoring user location for nearby hazards
export async function startProximityMonitoring(): Promise<void> {
  const prefs = await getProximityPrefs();
  if (!prefs.enabled) return;

  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return;

  // Stop existing subscription
  stopProximityMonitoring();

  watchSubscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: CHECK_INTERVAL_MS,
      distanceInterval: 50, // Only check if moved 50m
    },
    async (location) => {
      await checkNearbyHazards(location.coords.latitude, location.coords.longitude, prefs);
    }
  );
}

export function stopProximityMonitoring(): void {
  watchSubscription?.remove();
  watchSubscription = null;
}

async function checkNearbyHazards(lat: number, lng: number, prefs: ProximityPrefs): Promise<void> {
  // Refresh hazard cache periodically
  if (Date.now() - lastCacheTime > CACHE_DURATION_MS) {
    await refreshHazardCache(lat, lng);
  }

  const hazardPriority: Record<string, number> = {
    minor: 1, moderate: 2, significant: 3, dangerous: 4, extremely_dangerous: 5,
  };
  const minPriority = hazardPriority[prefs.minHazardLevel] || 3;

  // Get cooldowns
  const cooldownRaw = await AsyncStorage.getItem(ALERT_COOLDOWN_KEY);
  const cooldowns: Record<string, number> = cooldownRaw ? JSON.parse(cooldownRaw) : {};
  const now = Date.now();

  for (const hazard of cachedHazards) {
    // Check hazard level threshold
    if ((hazardPriority[hazard.hazard] || 0) < minPriority) continue;

    // Check cooldown
    if (cooldowns[hazard.id] && now - cooldowns[hazard.id] < COOLDOWN_MS) continue;

    // Check distance
    const dist = haversineM(lat, lng, hazard.lat, hazard.lng);
    if (dist > prefs.alertRadius) continue;

    // ALERT!
    const category = CATEGORIES.find((c) => c.key === hazard.category);
    const hazardInfo = HAZARD_LEVELS.find((h) => h.key === hazard.hazard);
    const distStr = dist < 100 ? `${Math.round(dist)}m` : `${(dist / 1000).toFixed(1)}km`;

    if (prefs.vibrate) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }

    await sendLocalNotification(
      `⚠️ ${category?.label || hazard.category} ahead`,
      `${hazardInfo?.label || 'Hazard'} reported ${distStr} ahead at ${hazard.address || 'nearby'}`,
      { reportId: hazard.id, screen: 'ReportDetail' },
      'community'
    );

    // Set cooldown
    cooldowns[hazard.id] = now;
    await AsyncStorage.setItem(ALERT_COOLDOWN_KEY, JSON.stringify(cooldowns));

    // Only one alert at a time
    return;
  }
}

async function refreshHazardCache(lat: number, lng: number): Promise<void> {
  const { data } = await supabase.rpc('get_nearby_reports', {
    lat, lng, radius_km: 2,
  });

  if (data) {
    cachedHazards = data
      .filter((r: any) => r.status !== 'resolved' && r.status !== 'closed')
      .map((r: any) => ({
        id: r.id,
        lat: r.latitude,
        lng: r.longitude,
        category: r.category,
        hazard: r.hazard_level || 'moderate',
        address: r.address || '',
      }));
  }

  lastCacheTime = Date.now();
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
