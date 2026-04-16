import { supabase } from './supabase';
import { sendLocalNotification } from './notifications';

// ============================================================
// Government Response Scoreboard with Countdown
// Public countdown timer from acknowledgment.
// Auto-generates "broken promise" notifications.
// ============================================================

export interface ResponseCommitment {
  clusterId: string;
  authorityId: string;
  authorityName: string;
  category: string;
  location: string;
  acknowledgedAt: string;
  committedDays: number; // Service-level agreement
  daysElapsed: number;
  daysRemaining: number;
  isOverdue: boolean;
  overdueBy: number; // days
  status: 'on_track' | 'warning' | 'overdue' | 'resolved';
  urgencyColor: string;
}

// Default service level agreements (days to resolve) by authority type
const DEFAULT_SLAS: Record<string, number> = {
  pothole: 14,
  streetlight: 7,
  sidewalk: 30,
  signage: 14,
  drainage: 21,
  graffiti: 14,
  road_debris: 3,
  guardrail: 7,
  crosswalk: 30,
  traffic_signal: 3,
  needed_traffic_light: 180,
  water_main: 1,
  sewer: 3,
  fallen_tree: 2,
  snow_ice: 1,
  accessibility: 30,
  bike_lane: 30,
  abandoned_vehicle: 14,
  illegal_dumping: 7,
  parking_meter: 14,
  park_playground: 30,
  utility_pole: 3,
  other: 30,
};

export async function getActiveCommitments(): Promise<ResponseCommitment[]> {
  // Get all clusters that have been acknowledged but not resolved
  const { data: clusters } = await supabase
    .from('report_clusters')
    .select('id, category, address, city, state, authority_id, status, submitted_at, updated_at')
    .in('status', ['acknowledged', 'in_progress', 'submitted'])
    .not('submitted_at', 'is', null)
    .order('submitted_at', { ascending: true });

  if (!clusters) return [];

  const commitments: ResponseCommitment[] = [];

  for (const cluster of clusters) {
    const acknowledgedAt = cluster.submitted_at;
    const sla = DEFAULT_SLAS[cluster.category] || 30;
    const daysElapsed = Math.floor((Date.now() - new Date(acknowledgedAt).getTime()) / 86400000);
    const daysRemaining = Math.max(0, sla - daysElapsed);
    const isOverdue = daysElapsed > sla;
    const overdueBy = isOverdue ? daysElapsed - sla : 0;

    let status: ResponseCommitment['status'] = 'on_track';
    let urgencyColor = '#4CAF50'; // green
    if (cluster.status === 'resolved') {
      status = 'resolved';
      urgencyColor = '#4CAF50';
    } else if (isOverdue) {
      status = 'overdue';
      urgencyColor = '#F44336'; // red
    } else if (daysRemaining <= 3) {
      status = 'warning';
      urgencyColor = '#FF9800'; // orange
    }

    // Get authority name
    let authorityName = 'Unknown Authority';
    if (cluster.authority_id) {
      const { data: auth } = await supabase
        .from('authorities')
        .select('name')
        .eq('id', cluster.authority_id)
        .single();
      if (auth) authorityName = auth.name;
    }

    commitments.push({
      clusterId: cluster.id,
      authorityId: cluster.authority_id,
      authorityName,
      category: cluster.category,
      location: cluster.address || `${cluster.city}, ${cluster.state}`,
      acknowledgedAt,
      committedDays: sla,
      daysElapsed,
      daysRemaining,
      isOverdue,
      overdueBy,
      status,
      urgencyColor,
    });
  }

  return commitments.sort((a, b) => {
    // Overdue first, then by urgency
    if (a.isOverdue && !b.isOverdue) return -1;
    if (!a.isOverdue && b.isOverdue) return 1;
    return a.daysRemaining - b.daysRemaining;
  });
}

// Check for broken promises and notify users
export async function checkBrokenPromises(): Promise<void> {
  const commitments = await getActiveCommitments();
  const overdue = commitments.filter((c) => c.isOverdue && c.overdueBy === 1); // Just became overdue

  for (const commitment of overdue) {
    await sendLocalNotification(
      'Deadline missed!',
      `${commitment.authorityName} has missed their ${commitment.committedDays}-day commitment to fix the ${commitment.category.replace('_', ' ')} at ${commitment.location}. It has been ${commitment.daysElapsed} days.`,
      { clusterId: commitment.clusterId, screen: 'Dashboard' },
      'escalations'
    );
  }

  // Also notify on major milestones
  const majorOverdue = commitments.filter((c) => c.overdueBy === 30 || c.overdueBy === 60 || c.overdueBy === 90);
  for (const commitment of majorOverdue) {
    await sendLocalNotification(
      `${commitment.overdueBy} days overdue`,
      `The ${commitment.category.replace('_', ' ')} at ${commitment.location} is now ${commitment.overdueBy} days past the ${commitment.committedDays}-day service commitment from ${commitment.authorityName}.`,
      { clusterId: commitment.clusterId, screen: 'Dashboard' },
      'escalations'
    );
  }
}

// Format countdown for display
export function formatCountdown(commitment: ResponseCommitment): string {
  if (commitment.status === 'resolved') return 'Resolved';
  if (commitment.isOverdue) return `${commitment.overdueBy}d OVERDUE`;
  if (commitment.daysRemaining === 0) return 'Due today';
  return `${commitment.daysRemaining}d remaining`;
}
