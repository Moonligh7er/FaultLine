import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================================
// Social Features: Leaderboards, Streaks, Neighborhood Feed
// ============================================================

const STREAK_KEY = 'report_streak';
const LAST_REPORT_KEY = 'last_report_date';

// --- STREAKS ---

export interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
  lastReportDate: string | null;
  isActiveToday: boolean;
}

export async function getStreak(): Promise<StreakInfo> {
  const raw = await AsyncStorage.getItem(STREAK_KEY);
  const saved = raw ? JSON.parse(raw) : { current: 0, longest: 0, lastDate: null };

  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  let current = saved.current;
  let longest = saved.longest;

  if (saved.lastDate === today) {
    // Already reported today
  } else if (saved.lastDate === yesterday) {
    // Streak continues but not yet reported today
  } else if (saved.lastDate) {
    // Streak broken
    current = 0;
  }

  return {
    currentStreak: current,
    longestStreak: Math.max(longest, current),
    lastReportDate: saved.lastDate,
    isActiveToday: saved.lastDate === today,
  };
}

export async function recordReportForStreak(): Promise<StreakInfo> {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  const raw = await AsyncStorage.getItem(STREAK_KEY);
  const saved = raw ? JSON.parse(raw) : { current: 0, longest: 0, lastDate: null };

  let current = saved.current;

  if (saved.lastDate === today) {
    // Already counted today
  } else if (saved.lastDate === yesterday || !saved.lastDate) {
    current += 1;
  } else {
    current = 1; // Streak reset
  }

  const longest = Math.max(saved.longest, current);

  await AsyncStorage.setItem(STREAK_KEY, JSON.stringify({
    current,
    longest,
    lastDate: today,
  }));

  return {
    currentStreak: current,
    longestStreak: longest,
    lastReportDate: today,
    isActiveToday: true,
  };
}

// --- LEADERBOARDS ---

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  totalReports: number;
  totalPoints: number;
  badges: number;
}

export async function getLeaderboard(
  scope: 'global' | 'state' | 'city',
  state?: string,
  city?: string,
  limit: number = 20
): Promise<LeaderboardEntry[]> {
  let query = supabase
    .from('profiles')
    .select('id, display_name, total_reports, points, badges')
    .order('points', { ascending: false })
    .limit(limit);

  // For state/city scope, we'd need to join with reports
  // Simplified: just return top users by points
  const { data, error } = await query;
  if (error || !data) return [];

  return data.map((row: any, i: number) => ({
    rank: i + 1,
    userId: row.id,
    displayName: row.display_name || 'Anonymous',
    totalReports: row.total_reports || 0,
    totalPoints: row.points || 0,
    badges: Array.isArray(row.badges) ? row.badges.length : 0,
  }));
}

// --- NEIGHBORHOOD FEED ---

export interface NeighborhoodActivity {
  type: 'report' | 'resolved' | 'milestone' | 'streak';
  message: string;
  timestamp: string;
  reportId?: string;
  category?: string;
}

export async function getNeighborhoodFeed(
  lat: number,
  lng: number,
  radiusKm: number = 3,
  limit: number = 20
): Promise<NeighborhoodActivity[]> {
  const { data: reports } = await supabase
    .rpc('get_nearby_reports', { lat, lng, radius_km: radiusKm })
    .limit(limit);

  if (!reports) return [];

  const feed: NeighborhoodActivity[] = reports.map((r: any) => {
    const category = r.category?.replace('_', ' ') || 'issue';

    if (r.status === 'resolved') {
      return {
        type: 'resolved' as const,
        message: `A ${category} near ${r.address || 'your area'} was resolved!`,
        timestamp: r.resolved_at || r.updated_at,
        reportId: r.id,
        category: r.category,
      };
    }

    return {
      type: 'report' as const,
      message: `New ${category} reported near ${r.address || 'your area'}`,
      timestamp: r.created_at,
      reportId: r.id,
      category: r.category,
    };
  });

  // Add milestone entries for clusters
  const { data: clusters } = await supabase
    .from('report_clusters')
    .select('*')
    .in('status', ['confirmed', 'submitted'])
    .order('last_reported_at', { ascending: false })
    .limit(5);

  if (clusters) {
    for (const cluster of clusters) {
      if (cluster.status === 'confirmed') {
        feed.push({
          type: 'milestone',
          message: `${cluster.report_count} people confirmed a ${cluster.category?.replace('_', ' ')} at ${cluster.address || 'nearby'} — authorities will be contacted!`,
          timestamp: cluster.last_reported_at,
        });
      }
      if (cluster.status === 'submitted') {
        feed.push({
          type: 'milestone',
          message: `Authorities have been notified about ${cluster.category?.replace('_', ' ')} at ${cluster.address || 'nearby'}`,
          timestamp: cluster.submitted_at || cluster.updated_at,
        });
      }
    }
  }

  return feed.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

// --- GAMIFICATION POINTS ---

export const POINT_VALUES = {
  submitReport: 10,
  submitWithPhoto: 15,
  submitQuickReport: 5,
  receiveUpvote: 2,
  receiveConfirm: 3,
  reportResolved: 25,
  streakDay: 5,
  streak7Days: 50,
  streak30Days: 200,
  firstReport: 50,
  tenthReport: 100,
  fiftiethReport: 500,
};

export async function awardPoints(userId: string, points: number, reason: string): Promise<void> {
  await supabase.rpc('award_points', { p_user_id: userId, p_points: points });
}
