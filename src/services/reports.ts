import { supabase } from './supabase';
import { Report, ReportCategory, ReportStatus, ReportSeverity } from '../types';

type CreateReportInput = Omit<Report, 'id' | 'createdAt' | 'updatedAt' | 'upvoteCount' | 'confirmCount'>;

export async function createReport(report: CreateReportInput): Promise<Report | null> {
  const { data, error } = await supabase
    .from('reports')
    .insert({
      user_id: report.userId,
      category: report.category,
      latitude: report.location.latitude,
      longitude: report.location.longitude,
      address: report.location.address,
      city: report.location.city,
      state: report.location.state,
      zip: report.location.zip,
      description: report.description,
      size_rating: report.severity.sizeRating || null,
      hazard_level: report.severity.hazardLevel,
      urgency: report.severity.urgency || null,
      condition_level: report.severity.condition || null,
      media: report.media,
      vehicle_damage: report.vehicleDamage,
      status: report.status,
      authority_id: report.authorityId,
      cluster_id: report.clusterId,
      submission_method: report.submissionMethod,
      is_anonymous: report.isAnonymous,
      sensor_detected: report.sensorDetected,
      offline_queued: report.offlineQueued,
      is_quick_report: report.isQuickReport,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating report:', error);
    return null;
  }

  return mapDbToReport(data);
}

export async function getReports(filters?: {
  category?: ReportCategory;
  status?: ReportStatus;
  state?: string;
  city?: string;
  userId?: string;
  limit?: number;
  offset?: number;
}): Promise<Report[]> {
  let query = supabase
    .from('reports')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters?.category) query = query.eq('category', filters.category);
  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.state) query = query.eq('state', filters.state);
  if (filters?.city) query = query.eq('city', filters.city);
  if (filters?.userId) query = query.eq('user_id', filters.userId);
  if (filters?.limit) query = query.limit(filters.limit);
  if (filters?.offset) query = query.range(filters.offset, filters.offset + (filters.limit || 20) - 1);

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching reports:', error);
    return [];
  }

  return (data || []).map(mapDbToReport);
}

export async function getReportById(id: string): Promise<Report | null> {
  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return null;
  return mapDbToReport(data);
}

export async function updateReportMedia(reportId: string, media: any[]): Promise<boolean> {
  const { error } = await supabase
    .from('reports')
    .update({ media, updated_at: new Date().toISOString() })
    .eq('id', reportId);
  return !error;
}

export async function addResolvedPhoto(reportId: string, media: any[]): Promise<boolean> {
  const { error } = await supabase
    .from('reports')
    .update({ resolved_media: media, updated_at: new Date().toISOString() })
    .eq('id', reportId);
  return !error;
}

export async function upvoteReport(reportId: string, userId: string): Promise<boolean> {
  const { error } = await supabase
    .from('report_votes')
    .insert({ report_id: reportId, user_id: userId, vote_type: 'upvote' });

  if (error) {
    console.error('Error upvoting:', error);
    return false;
  }

  await supabase.rpc('increment_upvote', { report_id: reportId });
  return true;
}

export async function confirmReport(reportId: string, userId: string): Promise<boolean> {
  const { error } = await supabase
    .from('report_votes')
    .insert({ report_id: reportId, user_id: userId, vote_type: 'confirm' });

  if (error) {
    console.error('Error confirming:', error);
    return false;
  }

  await supabase.rpc('increment_confirm', { report_id: reportId });
  return true;
}

export async function getNearbyReports(lat: number, lng: number, radiusKm: number = 5): Promise<Report[]> {
  const { data, error } = await supabase
    .rpc('get_nearby_reports', {
      lat,
      lng,
      radius_km: radiusKm,
    });

  if (error) {
    console.error('Error fetching nearby reports:', error);
    return [];
  }

  return (data || []).map(mapDbToReport);
}

// Rate limiting: max reports per user per hour
export async function checkRateLimit(userId: string, maxPerHour: number = 10): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from('reports')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', oneHourAgo);

  if (error) return false; // Deny on error — fail closed
  return (count || 0) < maxPerHour;
}

function mapDbToReport(row: any): Report {
  return {
    id: row.id,
    userId: row.user_id,
    category: row.category,
    location: {
      latitude: row.latitude,
      longitude: row.longitude,
      address: row.address,
      city: row.city,
      state: row.state,
      zip: row.zip,
    },
    description: row.description,
    severity: {
      sizeRating: row.size_rating,
      hazardLevel: row.hazard_level || 'moderate',
      urgency: row.urgency,
      condition: row.condition_level,
    },
    media: row.media || [],
    vehicleDamage: row.vehicle_damage,
    status: row.status,
    authorityId: row.authority_id,
    clusterId: row.cluster_id,
    submissionMethod: row.submission_method,
    submissionReference: row.submission_reference,
    upvoteCount: row.upvote_count || 0,
    confirmCount: row.confirm_count || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
    resolvedMedia: row.resolved_media,
    isAnonymous: row.is_anonymous,
    sensorDetected: row.sensor_detected,
    offlineQueued: row.offline_queued,
    isQuickReport: row.is_quick_report || false,
  };
}
