import { supabase } from './supabase';

export interface ReportCluster {
  id: string;
  category: string;
  centroidLatitude: number;
  centroidLongitude: number;
  reportCount: number;
  uniqueReporters: number;
  maxHazardLevel: string;
  status: string;
  authorityId?: string;
  city?: string;
  state?: string;
  address?: string;
  firstReportedAt: string;
  lastReportedAt: string;
  submittedAt?: string;
  escalatedAt?: string;
}

export async function getNearbyClusters(
  lat: number,
  lng: number,
  radiusKm: number = 10
): Promise<ReportCluster[]> {
  const { data, error } = await supabase.rpc('get_nearby_clusters', {
    lat,
    lng,
    radius_km: radiusKm,
  });

  if (error) {
    console.error('Error fetching clusters:', error);
    return [];
  }

  return (data || []).map(mapDbToCluster);
}

export async function getClusterById(id: string): Promise<ReportCluster | null> {
  const { data, error } = await supabase
    .from('report_clusters')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return null;
  return mapDbToCluster(data);
}

export async function getConfirmedClusters(state?: string): Promise<ReportCluster[]> {
  let query = supabase
    .from('report_clusters')
    .select('*')
    .in('status', ['confirmed', 'submitted', 'acknowledged', 'in_progress'])
    .order('report_count', { ascending: false });

  if (state) query = query.eq('state', state);

  const { data, error } = await query;
  if (error) return [];
  return (data || []).map(mapDbToCluster);
}

export async function getClusterForReport(reportId: string): Promise<ReportCluster | null> {
  const { data, error } = await supabase
    .from('cluster_reports')
    .select('cluster_id')
    .eq('report_id', reportId)
    .single();

  if (error || !data) return null;
  return getClusterById(data.cluster_id);
}

export async function getClusterStats(): Promise<{
  total: number;
  unconfirmed: number;
  confirmed: number;
  submitted: number;
  resolved: number;
}> {
  const { data, error } = await supabase
    .from('report_clusters')
    .select('status');

  if (error || !data) return { total: 0, unconfirmed: 0, confirmed: 0, submitted: 0, resolved: 0 };

  return {
    total: data.length,
    unconfirmed: data.filter((c: any) => c.status === 'unconfirmed').length,
    confirmed: data.filter((c: any) => c.status === 'confirmed').length,
    submitted: data.filter((c: any) => c.status === 'submitted').length,
    resolved: data.filter((c: any) => c.status === 'resolved').length,
  };
}

function mapDbToCluster(row: any): ReportCluster {
  return {
    id: row.id,
    category: row.category,
    centroidLatitude: row.centroid_latitude,
    centroidLongitude: row.centroid_longitude,
    reportCount: row.report_count,
    uniqueReporters: row.unique_reporters,
    maxHazardLevel: row.max_hazard_level,
    status: row.status,
    authorityId: row.authority_id,
    city: row.city,
    state: row.state,
    address: row.address,
    firstReportedAt: row.first_reported_at,
    lastReportedAt: row.last_reported_at,
    submittedAt: row.submitted_at,
    escalatedAt: row.escalated_at,
  };
}
