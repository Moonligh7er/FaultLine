import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================================
// Journalist & Media Pipeline
// Allows journalists to subscribe to area alerts,
// access data dashboards, and export reports.
// ============================================================

const MEDIA_ALERT_KEY = 'media_alert_subscriptions';

export interface MediaAlert {
  id: string;
  type: 'threshold' | 'area' | 'authority_failure';
  area?: { state: string; city?: string; zip?: string };
  threshold?: number; // e.g., 50 unresolved reports
  authorityId?: string;
  email?: string;
  isActive: boolean;
  createdAt: string;
}

export interface ExportableDataset {
  title: string;
  description: string;
  generatedAt: string;
  format: 'csv' | 'json';
  data: string; // The actual CSV or JSON content
  recordCount: number;
}

// Generate a CSV export of all reports for a given area
export async function exportReportsCSV(
  state: string,
  city?: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<ExportableDataset> {
  let query = supabase
    .from('reports')
    .select('id, category, latitude, longitude, address, city, state, zip, description, size_rating, hazard_level, urgency, condition_level, status, upvote_count, confirm_count, created_at, updated_at, resolved_at, is_anonymous')
    .eq('state', state)
    .order('created_at', { ascending: false });

  if (city) query = query.eq('city', city);
  if (dateFrom) query = query.gte('created_at', dateFrom);
  if (dateTo) query = query.lte('created_at', dateTo);

  const { data: reports } = await query.limit(5000);

  if (!reports || reports.length === 0) {
    return {
      title: `Infrastructure Reports — ${city || state}`,
      description: 'No reports found for the specified criteria',
      generatedAt: new Date().toISOString(),
      format: 'csv',
      data: '',
      recordCount: 0,
    };
  }

  // Build CSV
  const headers = [
    'Report ID', 'Category', 'Latitude', 'Longitude', 'Address', 'City', 'State', 'ZIP',
    'Description', 'Size', 'Hazard Level', 'Urgency', 'Condition', 'Status',
    'Upvotes', 'Confirmations', 'Reported Date', 'Updated Date', 'Resolved Date',
  ];

  const rows = reports.map((r: any) => [
    r.id, r.category, r.latitude, r.longitude,
    `"${(r.address || '').replace(/"/g, '""')}"`,
    r.city, r.state, r.zip,
    `"${(r.description || '').replace(/"/g, '""')}"`,
    r.size_rating, r.hazard_level, r.urgency, r.condition_level, r.status,
    r.upvote_count, r.confirm_count, r.created_at, r.updated_at, r.resolved_at || '',
  ].join(','));

  const csv = [headers.join(','), ...rows].join('\n');

  return {
    title: `Infrastructure Reports — ${city || state}`,
    description: `${reports.length} reports exported from Fault Line community data`,
    generatedAt: new Date().toISOString(),
    format: 'csv',
    data: csv,
    recordCount: reports.length,
  };
}

// Generate authority performance report
export async function exportAuthorityPerformance(state: string): Promise<ExportableDataset> {
  const { data: authorities } = await supabase
    .from('authorities')
    .select('id, name, level, city, state')
    .eq('state', state)
    .eq('is_active', true);

  if (!authorities) {
    return { title: '', description: '', generatedAt: new Date().toISOString(), format: 'csv', data: '', recordCount: 0 };
  }

  const rows: string[] = [];
  const headers = ['Authority', 'Level', 'City', 'Total Reports', 'Resolved', 'Fix Rate %', 'Avg Response Days', 'Unresolved'];

  for (const auth of authorities) {
    const { data: reports } = await supabase
      .from('reports')
      .select('status, created_at, resolved_at')
      .eq('authority_id', auth.id);

    if (!reports) continue;

    const total = reports.length;
    const resolved = reports.filter((r: any) => r.status === 'resolved').length;
    const fixRate = total > 0 ? Math.round((resolved / total) * 100) : 0;

    const responseTimes = reports
      .filter((r: any) => r.resolved_at)
      .map((r: any) => (new Date(r.resolved_at).getTime() - new Date(r.created_at).getTime()) / 86400000);
    const avgResponse = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a: number, b: number) => a + b, 0) / responseTimes.length)
      : 0;

    rows.push([
      `"${auth.name}"`, auth.level, auth.city || 'State-wide',
      total, resolved, fixRate, avgResponse, total - resolved,
    ].join(','));
  }

  return {
    title: `Authority Performance Report — ${state}`,
    description: `Performance metrics for ${authorities.length} authorities in ${state}`,
    generatedAt: new Date().toISOString(),
    format: 'csv',
    data: [headers.join(','), ...rows].join('\n'),
    recordCount: authorities.length,
  };
}

// Save a media alert subscription
export async function subscribeToAlert(alert: Omit<MediaAlert, 'id' | 'createdAt'>): Promise<void> {
  const alerts = await getAlerts();
  alerts.push({
    ...alert,
    id: `alert-${Date.now()}`,
    createdAt: new Date().toISOString(),
  });
  await AsyncStorage.setItem(MEDIA_ALERT_KEY, JSON.stringify(alerts));
}

export async function getAlerts(): Promise<MediaAlert[]> {
  const raw = await AsyncStorage.getItem(MEDIA_ALERT_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function removeAlert(id: string): Promise<void> {
  const alerts = await getAlerts();
  await AsyncStorage.setItem(MEDIA_ALERT_KEY, JSON.stringify(alerts.filter((a) => a.id !== id)));
}
