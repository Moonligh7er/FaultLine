import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================================
// Local Business Micro-Rewards
// Businesses sponsor rewards for civic participation.
// Aligns economic incentives with community engagement.
// ============================================================

export interface Reward {
  id: string;
  businessName: string;
  businessLogo?: string;
  title: string; // "Free coffee at Main Street Café"
  description: string;
  pointsCost: number;
  category: 'food' | 'service' | 'retail' | 'entertainment' | 'other';
  expiresAt?: string;
  totalAvailable: number;
  totalClaimed: number;
  isActive: boolean;
  businessCity: string;
  businessState: string;
}

export interface ClaimedReward {
  id: string;
  rewardId: string;
  userId: string;
  claimedAt: string;
  redeemedAt?: string;
  redemptionCode: string;
  status: 'claimed' | 'redeemed' | 'expired';
  reward: Reward;
}

export async function getAvailableRewards(
  city?: string,
  state?: string,
): Promise<Reward[]> {
  let query = supabase
    .from('rewards')
    .select('*')
    .eq('is_active', true)
    .order('points_cost', { ascending: true });

  if (state) query = query.eq('business_state', state);
  if (city) query = query.eq('business_city', city);

  const { data, error } = await query;

  if (error || !data) {
    // Table might not exist yet — return empty
    return [];
  }

  return data.map(mapDbToReward);
}

// Claiming spends points, and points are server-owned: the client can't
// deduct them or bump claim counts. Claims need a server-side function;
// until one exists the app reports claiming as unavailable.
export async function claimReward(
  _rewardId: string,
  _userId: string,
  _userPoints: number,
): Promise<{ success: boolean; code?: string; error?: string }> {
  return { success: false, error: 'Rewards can’t be claimed from the app yet.' };
}

export async function getClaimedRewards(userId: string): Promise<ClaimedReward[]> {
  const { data } = await supabase
    .from('claimed_rewards')
    .select('*, rewards(*)')
    .eq('user_id', userId)
    .order('claimed_at', { ascending: false });

  if (!data) return [];

  return data.map((row: any) => ({
    id: row.id,
    rewardId: row.reward_id,
    userId: row.user_id,
    claimedAt: row.claimed_at,
    redeemedAt: row.redeemed_at,
    redemptionCode: row.redemption_code,
    status: row.status,
    reward: mapDbToReward(row.rewards),
  }));
}

function mapDbToReward(row: any): Reward {
  return {
    id: row.id,
    businessName: row.business_name,
    businessLogo: row.business_logo,
    title: row.title,
    description: row.description,
    pointsCost: row.points_cost,
    category: row.category,
    expiresAt: row.expires_at,
    totalAvailable: row.total_available,
    totalClaimed: row.total_claimed,
    isActive: row.is_active,
    businessCity: row.business_city,
    businessState: row.business_state,
  };
}
