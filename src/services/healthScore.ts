import { supabase } from './supabase';

// ============================================================
// Infrastructure Health Score
// A-F grade for every street, neighborhood, and city
// based on report density, fix rate, response time,
// severity distribution, and recurrence.
// ============================================================

export type Grade = 'A+' | 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'C-' | 'D+' | 'D' | 'D-' | 'F';

export interface HealthScore {
  entityType: 'street' | 'neighborhood' | 'city' | 'state';
  entityName: string;
  grade: Grade;
  numericScore: number; // 0-100
  breakdown: {
    reportDensity: number; // 0-100 (lower reports = higher score)
    fixRate: number; // 0-100 (% resolved)
    responseTime: number; // 0-100 (faster = higher)
    severityIndex: number; // 0-100 (less severe = higher)
    recurrenceRate: number; // 0-100 (less recurrence = higher)
  };
  totalReports: number;
  resolvedReports: number;
  avgResponseDays: number;
  trend: 'improving' | 'stable' | 'declining';
  lastUpdated: string;
}

export function scoreToGrade(score: number): Grade {
  if (score >= 97) return 'A+';
  if (score >= 93) return 'A';
  if (score >= 90) return 'A-';
  if (score >= 87) return 'B+';
  if (score >= 83) return 'B';
  if (score >= 80) return 'B-';
  if (score >= 77) return 'C+';
  if (score >= 73) return 'C';
  if (score >= 70) return 'C-';
  if (score >= 67) return 'D+';
  if (score >= 63) return 'D';
  if (score >= 60) return 'D-';
  return 'F';
}

export function gradeColor(grade: Grade): string {
  if (grade.startsWith('A')) return '#4CAF50';
  if (grade.startsWith('B')) return '#8BC34A';
  if (grade.startsWith('C')) return '#FFC107';
  if (grade.startsWith('D')) return '#FF9800';
  return '#F44336';
}

export async function getCityHealthScore(city: string, state: string): Promise<HealthScore | null> {
  const { data: reports } = await supabase
    .from('reports')
    .select('status, hazard_level, created_at, resolved_at, category')
    .eq('city', city)
    .eq('state', state);

  if (!reports || reports.length === 0) return null;

  const total = reports.length;
  const resolved = reports.filter((r) => r.status === 'resolved').length;
  const fixRate = total > 0 ? (resolved / total) * 100 : 100;

  // Average response time for resolved reports
  const responseTimes = reports
    .filter((r) => r.resolved_at && r.created_at)
    .map((r) => (new Date(r.resolved_at).getTime() - new Date(r.created_at).getTime()) / 86400000);
  const avgResponseDays = responseTimes.length > 0
    ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
    : 0;

  // Severity index (weighted average)
  const severityWeights: Record<string, number> = {
    minor: 1, moderate: 2, significant: 3, dangerous: 4, extremely_dangerous: 5,
  };
  const avgSeverity = reports.reduce((sum, r) => sum + (severityWeights[r.hazard_level] || 2), 0) / total;

  // Report density score (fewer = better, normalized per 10k population estimate)
  const densityScore = Math.max(0, 100 - (total * 2));

  // Fix rate score
  const fixRateScore = fixRate;

  // Response time score (0 days = 100, 30+ days = 0)
  const responseScore = Math.max(0, 100 - (avgResponseDays * 3.33));

  // Severity score (1.0 avg = 100, 5.0 avg = 0)
  const severityScore = Math.max(0, 100 - ((avgSeverity - 1) * 25));

  // Recurrence: check for clusters with multiple reports at same location
  const { data: clusters } = await supabase
    .from('report_clusters')
    .select('report_count')
    .eq('city', city)
    .eq('state', state);

  const recurringClusters = (clusters || []).filter((c) => c.report_count > 3).length;
  const totalClusters = (clusters || []).length || 1;
  const recurrenceScore = Math.max(0, 100 - ((recurringClusters / totalClusters) * 100));

  // Weighted composite score
  const numericScore = Math.round(
    densityScore * 0.15 +
    fixRateScore * 0.30 +
    responseScore * 0.25 +
    severityScore * 0.15 +
    recurrenceScore * 0.15
  );

  // Trend: compare last 30 days vs previous 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000).toISOString();
  const recentReports = reports.filter((r) => r.created_at >= thirtyDaysAgo).length;
  const previousReports = reports.filter((r) => r.created_at >= sixtyDaysAgo && r.created_at < thirtyDaysAgo).length;
  const trend = recentReports < previousReports * 0.8 ? 'improving' : recentReports > previousReports * 1.2 ? 'declining' : 'stable';

  return {
    entityType: 'city',
    entityName: `${city}, ${state}`,
    grade: scoreToGrade(numericScore),
    numericScore,
    breakdown: {
      reportDensity: Math.round(densityScore),
      fixRate: Math.round(fixRateScore),
      responseTime: Math.round(responseScore),
      severityIndex: Math.round(severityScore),
      recurrenceRate: Math.round(recurrenceScore),
    },
    totalReports: total,
    resolvedReports: resolved,
    avgResponseDays: Math.round(avgResponseDays * 10) / 10,
    trend,
    lastUpdated: new Date().toISOString(),
  };
}

export async function getStateHealthScores(state: string): Promise<HealthScore[]> {
  const { data: cities } = await supabase
    .from('reports')
    .select('city')
    .eq('state', state)
    .not('city', 'is', null);

  if (!cities) return [];

  const uniqueCities = [...new Set(cities.map((c: any) => c.city).filter(Boolean))];
  const scores: HealthScore[] = [];

  for (const city of uniqueCities.slice(0, 50)) {
    const score = await getCityHealthScore(city as string, state);
    if (score) scores.push(score);
  }

  return scores.sort((a, b) => b.numericScore - a.numericScore);
}
