import { supabase } from './supabase';
import { Share } from 'react-native';

// ============================================================
// Deterioration Timelapse
// When the same spot gets reported over weeks/months,
// auto-build a photographic timeline of neglect.
// ============================================================

export interface TimelapseFrame {
  reportId: string;
  photoUrl: string;
  thumbnailUrl?: string;
  date: string;
  daysSinceFirst: number;
  hazardLevel: string;
  description?: string;
  reporterCount: number; // cumulative unique reporters at this point
}

export interface TimelapseData {
  clusterId: string;
  category: string;
  location: { address?: string; city?: string; state?: string; lat: number; lng: number };
  totalDays: number;
  totalFrames: number;
  frames: TimelapseFrame[];
  status: string;
  isResolved: boolean;
  shareText: string;
}

export async function getDeterioriationTimelapse(clusterId: string): Promise<TimelapseData | null> {
  // Get cluster info
  const { data: cluster } = await supabase
    .from('report_clusters')
    .select('*')
    .eq('id', clusterId)
    .single();

  if (!cluster) return null;

  // Get all reports in this cluster, ordered by date
  const { data: links } = await supabase
    .from('cluster_reports')
    .select('report_id')
    .eq('cluster_id', clusterId);

  if (!links || links.length === 0) return null;

  const reportIds = links.map((l: any) => l.report_id);

  const { data: reports } = await supabase
    .from('reports')
    .select('id, media, hazard_level, description, created_at, user_id')
    .in('id', reportIds)
    .order('created_at', { ascending: true });

  if (!reports || reports.length === 0) return null;

  const firstDate = new Date(reports[0].created_at);
  const uniqueReporters = new Set<string>();

  const frames: TimelapseFrame[] = [];

  for (const report of reports) {
    if (report.user_id) uniqueReporters.add(report.user_id);

    const media = report.media || [];
    const photo = media.find((m: any) => m.type === 'photo' && (m.uploadedUrl || m.thumbnailUrl));

    if (photo) {
      frames.push({
        reportId: report.id,
        photoUrl: photo.uploadedUrl || photo.uri,
        thumbnailUrl: photo.thumbnailUrl,
        date: new Date(report.created_at).toLocaleDateString(),
        daysSinceFirst: Math.floor((new Date(report.created_at).getTime() - firstDate.getTime()) / 86400000),
        hazardLevel: report.hazard_level || 'moderate',
        description: report.description,
        reporterCount: uniqueReporters.size,
      });
    }
  }

  const totalDays = Math.floor((Date.now() - firstDate.getTime()) / 86400000);
  const category = cluster.category?.replace('_', ' ') || 'Infrastructure issue';
  const location = {
    address: cluster.address,
    city: cluster.city,
    state: cluster.state,
    lat: cluster.centroid_latitude,
    lng: cluster.centroid_longitude,
  };

  const shareText = [
    `📸 ${totalDays} Days of Neglect — ${category}`,
    `📍 ${location.address || location.city || 'Location'}${location.state ? `, ${location.state}` : ''}`,
    '',
    `${cluster.report_count} community members reported this issue over ${totalDays} days.`,
    frames.length > 0 ? `${frames.length} photos document the deterioration.` : '',
    cluster.status === 'submitted' ? 'Authorities have been contacted.' : 'Authorities have NOT been contacted yet.',
    '',
    `Status: ${cluster.status.replace('_', ' ').toUpperCase()}`,
    '',
    `🗺️ https://maps.google.com/?q=${location.lat},${location.lng}`,
    '',
    'Documented by Fault Line — Community Infrastructure Accountability Platform',
  ].filter(Boolean).join('\n');

  return {
    clusterId,
    category,
    location,
    totalDays,
    totalFrames: frames.length,
    frames,
    status: cluster.status,
    isResolved: cluster.status === 'resolved',
    shareText,
  };
}

export async function shareTimelapse(timelapse: TimelapseData): Promise<void> {
  await Share.share({
    message: timelapse.shareText,
    title: `${timelapse.totalDays} Days of Neglect — ${timelapse.category}`,
  });
}
