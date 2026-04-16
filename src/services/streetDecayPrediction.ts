import { supabase } from './supabase';

// ============================================================
// Infrastructure Decay Prediction per Street
// Per-street decay curves using report history,
// seasonal patterns, and severity trends.
// ============================================================

export interface StreetDecayProfile {
  streetName: string;
  city: string;
  state: string;
  currentCondition: 'good' | 'fair' | 'poor' | 'critical';
  decayScore: number; // 0-100 (100 = worst)
  probabilityOfMajorRepair12Months: number; // 0-1
  historicalReports: number;
  resolvedReports: number;
  recurrenceRate: number; // % of issues that come back
  avgTimeBetweenReports: number; // days
  seasonalPattern: { month: string; reportCount: number }[];
  riskFactors: string[];
  projectedTimeline: string;
  coordinates: { lat: number; lng: number }[];
}

export async function getStreetDecayProfile(
  streetName: string,
  city: string,
  state: string,
): Promise<StreetDecayProfile | null> {
  // Get all reports on this street
  const { data: reports } = await supabase
    .from('reports')
    .select('latitude, longitude, category, hazard_level, status, created_at, resolved_at')
    .eq('city', city)
    .eq('state', state)
    .ilike('address', `%${streetName}%`)
    .order('created_at', { ascending: true });

  if (!reports || reports.length < 2) return null;

  const total = reports.length;
  const resolved = reports.filter((r) => r.status === 'resolved').length;
  const coordinates = reports.map((r) => ({ lat: r.latitude, lng: r.longitude }));

  // Recurrence: resolved then re-reported
  const resolvedDates = reports
    .filter((r) => r.resolved_at)
    .map((r) => ({ resolved: new Date(r.resolved_at), created: new Date(r.created_at) }));

  let recurringCount = 0;
  for (const rd of resolvedDates) {
    const reReport = reports.find((r) => {
      const created = new Date(r.created_at);
      return created > rd.resolved && (created.getTime() - rd.resolved.getTime()) < 180 * 86400000;
    });
    if (reReport) recurringCount++;
  }
  const recurrenceRate = resolved > 0 ? Math.round((recurringCount / resolved) * 100) : 0;

  // Average time between reports
  const dates = reports.map((r) => new Date(r.created_at).getTime()).sort();
  const intervals = [];
  for (let i = 1; i < dates.length; i++) {
    intervals.push((dates[i] - dates[i - 1]) / 86400000);
  }
  const avgInterval = intervals.length > 0
    ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length)
    : 365;

  // Seasonal pattern
  const monthCounts: Record<number, number> = {};
  for (const r of reports) {
    const month = new Date(r.created_at).getMonth();
    monthCounts[month] = (monthCounts[month] || 0) + 1;
  }
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const seasonalPattern = MONTHS.map((month, i) => ({ month, reportCount: monthCounts[i] || 0 }));

  // Severity trend
  const hazardScores: Record<string, number> = {
    minor: 1, moderate: 2, significant: 3, dangerous: 4, extremely_dangerous: 5,
  };
  const recentReports = reports.slice(-5);
  const olderReports = reports.slice(0, 5);
  const recentAvgSeverity = recentReports.reduce((s, r) => s + (hazardScores[r.hazard_level] || 2), 0) / recentReports.length;
  const olderAvgSeverity = olderReports.reduce((s, r) => s + (hazardScores[r.hazard_level] || 2), 0) / olderReports.length;
  const severityTrend = recentAvgSeverity - olderAvgSeverity;

  // Calculate decay score
  let decayScore = 30; // Base
  decayScore += Math.min(30, total * 3); // More reports = worse
  decayScore += recurrenceRate * 0.2; // High recurrence = worse
  decayScore += severityTrend > 0 ? severityTrend * 10 : 0; // Worsening trend
  decayScore -= (resolved / total) * 20; // Fix rate helps
  decayScore = Math.max(0, Math.min(100, decayScore));

  // Risk factors
  const riskFactors: string[] = [];
  if (recurrenceRate > 30) riskFactors.push(`${recurrenceRate}% of repairs fail within 6 months`);
  if (severityTrend > 0.5) riskFactors.push('Severity is worsening over time');
  if (avgInterval < 30) riskFactors.push(`New reports every ${avgInterval} days on average`);
  if (total > 10) riskFactors.push(`${total} total reports — chronic problem area`);

  const peakMonths = seasonalPattern.filter((m) => m.reportCount >= 2).map((m) => m.month);
  if (peakMonths.length > 0) riskFactors.push(`Peak damage months: ${peakMonths.join(', ')}`);

  // Condition assessment
  let condition: 'good' | 'fair' | 'poor' | 'critical' = 'good';
  if (decayScore >= 70) condition = 'critical';
  else if (decayScore >= 50) condition = 'poor';
  else if (decayScore >= 30) condition = 'fair';

  // Probability of major repair
  const prob = Math.min(0.95, decayScore / 100 + (recurrenceRate / 200));

  // Timeline projection
  let timeline = 'No major repair expected in the next 12 months';
  if (prob > 0.7) timeline = 'Major repair likely needed within 6 months';
  else if (prob > 0.5) timeline = 'Major repair likely needed within 12 months';
  else if (prob > 0.3) timeline = 'Minor maintenance recommended within 12 months';

  return {
    streetName,
    city,
    state,
    currentCondition: condition,
    decayScore: Math.round(decayScore),
    probabilityOfMajorRepair12Months: Math.round(prob * 100) / 100,
    historicalReports: total,
    resolvedReports: resolved,
    recurrenceRate,
    avgTimeBetweenReports: avgInterval,
    seasonalPattern,
    riskFactors,
    projectedTimeline: timeline,
    coordinates,
  };
}

// Get worst streets in a city
export async function getWorstStreets(
  city: string,
  state: string,
  limit: number = 10,
): Promise<{ street: string; reportCount: number; decayScore: number }[]> {
  const { data } = await supabase
    .from('reports')
    .select('address')
    .eq('city', city)
    .eq('state', state)
    .not('address', 'is', null);

  if (!data) return [];

  // Extract street names and count
  const streetCounts: Record<string, number> = {};
  for (const r of data) {
    const addr = (r.address || '').trim();
    if (!addr) continue;
    // Extract street name (remove house numbers)
    const street = addr.replace(/^\d+\s*/, '').trim();
    if (street.length < 3) continue;
    streetCounts[street] = (streetCounts[street] || 0) + 1;
  }

  return Object.entries(streetCounts)
    .filter(([_, count]) => count >= 2)
    .map(([street, reportCount]) => ({
      street,
      reportCount,
      decayScore: Math.min(100, reportCount * 10 + 20),
    }))
    .sort((a, b) => b.reportCount - a.reportCount)
    .slice(0, limit);
}
