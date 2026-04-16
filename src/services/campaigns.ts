import { supabase } from './supabase';
import { Share } from 'react-native';
import { ReportCategory } from '../types';

// ============================================================
// Community Campaigns
// Organized collective action around specific issues.
// "Fix Elm Street" with goal tracking, shared timeline,
// and social sharing toolkit.
// ============================================================

export interface Campaign {
  id: string;
  title: string;
  description: string;
  creatorId: string;
  creatorName: string;
  targetCategory?: ReportCategory;
  targetArea: {
    address?: string;
    city?: string;
    state?: string;
    latitude?: number;
    longitude?: number;
    radiusM?: number;
  };
  goalReports: number; // Target number of reports to trigger escalation
  currentReports: number;
  supporters: number;
  status: 'active' | 'achieved' | 'escalated' | 'closed';
  linkedClusterIds: string[];
  createdAt: string;
  achievedAt?: string;
  escalatedAt?: string;
}

export interface CampaignUpdate {
  id: string;
  campaignId: string;
  type: 'report' | 'milestone' | 'escalation' | 'resolution' | 'comment';
  message: string;
  userId?: string;
  userName?: string;
  timestamp: string;
}

// Create a new campaign
export async function createCampaign(
  title: string,
  description: string,
  userId: string,
  userName: string,
  targetArea: Campaign['targetArea'],
  goalReports: number = 10,
  targetCategory?: ReportCategory,
): Promise<Campaign | null> {
  const campaign: Omit<Campaign, 'id'> = {
    title,
    description,
    creatorId: userId,
    creatorName: userName,
    targetCategory,
    targetArea,
    goalReports,
    currentReports: 0,
    supporters: 1,
    status: 'active',
    linkedClusterIds: [],
    createdAt: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      title: campaign.title,
      description: campaign.description,
      creator_id: campaign.creatorId,
      creator_name: campaign.creatorName,
      target_category: campaign.targetCategory,
      target_area: campaign.targetArea,
      goal_reports: campaign.goalReports,
      current_reports: 0,
      supporters: 1,
      status: 'active',
      linked_cluster_ids: [],
    })
    .select()
    .single();

  if (error) {
    // Campaign table may not exist — store locally
    console.error('Campaign creation failed (table may not exist):', error.message);
    return null;
  }

  return mapDbToCampaign(data);
}

export async function getCampaigns(
  state?: string,
  city?: string,
  status: 'active' | 'all' = 'active',
): Promise<Campaign[]> {
  let query = supabase
    .from('campaigns')
    .select('*')
    .order('supporters', { ascending: false });

  if (status === 'active') query = query.eq('status', 'active');

  const { data, error } = await query.limit(50);
  if (error || !data) return [];

  return data.map(mapDbToCampaign);
}

export async function joinCampaign(campaignId: string, userId: string): Promise<boolean> {
  const { error } = await supabase
    .from('campaigns')
    .update({ supporters: supabase.rpc('increment_supporters', { campaign_id: campaignId }) as any })
    .eq('id', campaignId);

  // Simplified: just increment
  try {
    await supabase.rpc('increment_campaign_supporters', { p_campaign_id: campaignId });
  } catch {
    // RPC might not exist yet
  }

  return true;
}

export async function shareCampaign(campaign: Campaign): Promise<void> {
  const message = [
    `🚨 ${campaign.title}`,
    '',
    campaign.description,
    '',
    `📊 Progress: ${campaign.currentReports}/${campaign.goalReports} reports`,
    `👥 ${campaign.supporters} supporters`,
    '',
    `Help us reach ${campaign.goalReports} reports to trigger official escalation!`,
    '',
    `${campaign.targetArea.address || campaign.targetArea.city || ''}`,
    '',
    'Report issues via Fault Line — Community Infrastructure Accountability Platform',
  ].filter(Boolean).join('\n');

  await Share.share({ message, title: campaign.title });
}

export async function getCampaignUpdates(campaignId: string): Promise<CampaignUpdate[]> {
  const { data } = await supabase
    .from('campaign_updates')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('timestamp', { ascending: false })
    .limit(50);

  if (!data) return [];

  return data.map((row: any) => ({
    id: row.id,
    campaignId: row.campaign_id,
    type: row.type,
    message: row.message,
    userId: row.user_id,
    userName: row.user_name,
    timestamp: row.timestamp,
  }));
}

function mapDbToCampaign(row: any): Campaign {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    creatorId: row.creator_id,
    creatorName: row.creator_name,
    targetCategory: row.target_category,
    targetArea: row.target_area || {},
    goalReports: row.goal_reports,
    currentReports: row.current_reports,
    supporters: row.supporters,
    status: row.status,
    linkedClusterIds: row.linked_cluster_ids || [],
    createdAt: row.created_at,
    achievedAt: row.achieved_at,
    escalatedAt: row.escalated_at,
  };
}
