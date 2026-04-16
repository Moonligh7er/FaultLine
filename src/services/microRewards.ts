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

export async function claimReward(
  rewardId: string,
  userId: string,
  userPoints: number,
): Promise<{ success: boolean; code?: string; error?: string }> {
  // Get the reward
  const { data: reward } = await supabase
    .from('rewards')
    .select('*')
    .eq('id', rewardId)
    .single();

  if (!reward) return { success: false, error: 'Reward not found' };
  if (reward.total_claimed >= reward.total_available) return { success: false, error: 'Reward sold out' };
  if (userPoints < reward.points_cost) return { success: false, error: `Need ${reward.points_cost - userPoints} more points` };

  // Generate redemption code
  const code = generateRedemptionCode();

  // Claim the reward
  const { error: claimError } = await supabase.from('claimed_rewards').insert({
    reward_id: rewardId,
    user_id: userId,
    redemption_code: code,
    status: 'claimed',
    claimed_at: new Date().toISOString(),
  });

  if (claimError) return { success: false, error: claimError.message };

  // Deduct points
  await supabase.rpc('award_points', { p_user_id: userId, p_points: -reward.points_cost });

  // Increment claimed count
  await supabase
    .from('rewards')
    .update({ total_claimed: reward.total_claimed + 1 })
    .eq('id', rewardId);

  return { success: true, code };
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

function generateRedemptionCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No confusing chars (0/O, 1/I/L)
  let code = 'FL-';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
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
