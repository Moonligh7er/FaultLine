import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { supabase } from './supabase';
import { sendLocalNotification } from './notifications';
import { CATEGORIES, HAZARD_LEVELS } from '../constants/categories';

// ============================================================
// Witness Network
// When a dangerous hazard is reported, silently ask nearby
// users to verify it. Instant crowd-sourced verification.
// ============================================================

const WITNESS_RADIUS_M = 500; // Ask users within 500m
const WITNESS_COOLDOWN_MS = 600000; // 10 min between witness requests per user
const MIN_HAZARD_FOR_WITNESS = 3; // 'significant' and above

const HAZARD_PRIORITY: Record<string, number> = {
  minor: 1, moderate: 2, significant: 3, dangerous: 4, extremely_dangerous: 5,
};

export interface WitnessRequest {
  reportId: string;
  clusterId?: string;
  category: string;
  hazardLevel: string;
  latitude: number;
  longitude: number;
  address?: string;
  distanceM: number;
  requestedAt: string;
}

// Check if there are any new reports near the user that need verification
export async function checkForWitnessOpportunities(
  userLat: number,
  userLng: number,
  userId?: string,
): Promise<WitnessRequest | null> {
  // Get recent unverified reports nearby
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();

  const { data: reports } = await supabase
    .from('reports')
    .select('id, category, hazard_level, latitude, longitude, address, cluster_id, user_id, created_at')
    .gte('created_at', oneHourAgo)
    .neq('status', 'resolved')
    .neq('status', 'closed')
    .limit(20);

  if (!reports) return null;

  for (const report of reports) {
    // Don't ask the reporter to verify their own report
    if (userId && report.user_id === userId) continue;

    // Only for significant+ hazards
    if ((HAZARD_PRIORITY[report.hazard_level] || 0) < MIN_HAZARD_FOR_WITNESS) continue;

    // Check distance
    const dist = haversineM(userLat, userLng, report.latitude, report.longitude);
    if (dist > WITNESS_RADIUS_M) continue;

    // Check if cluster already has enough confirmations
    if (report.cluster_id) {
      const { data: cluster } = await supabase
        .from('report_clusters')
        .select('unique_reporters')
        .eq('id', report.cluster_id)
        .single();

      if (cluster && cluster.unique_reporters >= 3) continue; // Already verified
    }

    return {
      reportId: report.id,
      clusterId: report.cluster_id,
      category: report.category,
      hazardLevel: report.hazard_level,
      latitude: report.latitude,
      longitude: report.longitude,
      address: report.address,
      distanceM: Math.round(dist),
      requestedAt: new Date().toISOString(),
    };
  }

  return null;
}

// Send a witness request notification
export async function sendWitnessRequest(request: WitnessRequest): Promise<void> {
  const cat = CATEGORIES.find((c) => c.key === request.category);
  const hazard = HAZARD_LEVELS.find((h) => h.key === request.hazardLevel);
  const distStr = request.distanceM < 100
    ? `${request.distanceM}m`
    : `${(request.distanceM / 1000).toFixed(1)}km`;

  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

  await sendLocalNotification(
    `Can you verify? ${cat?.label || request.category} nearby`,
    `A ${hazard?.label?.toLowerCase() || ''} ${cat?.label?.toLowerCase() || 'issue'} was reported ${distStr} from you at ${request.address || 'nearby'}. If you're heading that way, can you snap a photo to verify?`,
    {
      reportId: request.reportId,
      screen: 'ReportDetail',
      witnessRequest: true,
    },
    'community'
  );
}

// Run witness check (called from App.tsx on foreground)
export async function runWitnessCheck(userId?: string): Promise<void> {
  const { status } = await Location.getForegroundPermissionsAsync();
  if (status !== 'granted') return;

  const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  const request = await checkForWitnessOpportunities(
    loc.coords.latitude,
    loc.coords.longitude,
    userId,
  );

  if (request) {
    await sendWitnessRequest(request);
  }
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
