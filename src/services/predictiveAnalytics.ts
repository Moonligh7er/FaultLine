import { supabase } from './supabase';
import { ReportCategory, ReportLocation } from '../types';

// ============================================================
// Predictive Analytics Service
// Identifies areas likely to develop infrastructure issues
// based on historical patterns, weather, road age, traffic
// ============================================================

export interface PredictionZone {
  id: string;
  latitude: number;
  longitude: number;
  radius_m: number;
  predicted_category: ReportCategory;
  risk_score: number; // 0-100
  contributing_factors: string[];
  predicted_timeframe: string; // "within 30 days", "within 90 days"
  confidence: number; // 0-1
  nearby_historical_count: number;
}

export interface RiskHeatmapPoint {
  latitude: number;
  longitude: number;
  weight: number; // 0-1 intensity
}

// Get prediction zones for a given area
export async function getPredictionZones(
  lat: number,
  lng: number,
  radiusKm: number = 5
): Promise<PredictionZone[]> {
  const { data, error } = await supabase.rpc('get_prediction_zones', {
    lat, lng, radius_km: radiusKm,
  });

  if (error) {
    // Fall back to client-side heuristic if RPC not available
    return generateLocalPredictions(lat, lng, radiusKm);
  }

  return data || [];
}

// Generate risk heatmap data for map overlay
export async function getRiskHeatmap(
  lat: number,
  lng: number,
  radiusKm: number = 5
): Promise<RiskHeatmapPoint[]> {
  const { data, error } = await supabase.rpc('get_risk_heatmap', {
    lat, lng, radius_km: radiusKm,
  });

  if (error) {
    return generateLocalHeatmap(lat, lng, radiusKm);
  }

  return data || [];
}

// Client-side heuristic predictions based on historical data
async function generateLocalPredictions(
  lat: number,
  lng: number,
  radiusKm: number
): Promise<PredictionZone[]> {
  // Fetch historical reports for the area
  const { data: reports } = await supabase
    .from('reports')
    .select('latitude, longitude, category, hazard_level, created_at, status')
    .not('status', 'eq', 'rejected')
    .limit(500);

  if (!reports || reports.length === 0) return [];

  // Cluster historical reports by proximity
  const clusters: Map<string, typeof reports> = new Map();
  const gridSize = 0.002; // ~200m grid cells

  for (const report of reports) {
    const gridKey = `${Math.round(report.latitude / gridSize) * gridSize},${Math.round(report.longitude / gridSize) * gridSize}`;
    if (!clusters.has(gridKey)) clusters.set(gridKey, []);
    clusters.get(gridKey)!.push(report);
  }

  // Score each cluster
  const predictions: PredictionZone[] = [];

  for (const [key, clusterReports] of clusters.entries()) {
    const [latStr, lngStr] = key.split(',');
    const clusterLat = parseFloat(latStr);
    const clusterLng = parseFloat(lngStr);

    // Skip if too far from requested area
    const dist = haversineKm(lat, lng, clusterLat, clusterLng);
    if (dist > radiusKm) continue;

    const factors: string[] = [];
    let riskScore = 0;

    // Factor 1: Repeat reports (same area, recurring issues)
    const repeatCount = clusterReports.length;
    if (repeatCount >= 5) {
      riskScore += 30;
      factors.push(`${repeatCount} historical reports in this area`);
    } else if (repeatCount >= 2) {
      riskScore += 15;
      factors.push(`${repeatCount} prior reports nearby`);
    }

    // Factor 2: Resolved then re-reported (poor repair quality)
    const resolvedThenNew = clusterReports.filter((r) => r.status === 'resolved').length;
    const totalReports = clusterReports.length;
    if (resolvedThenNew > 0 && totalReports > resolvedThenNew) {
      riskScore += 25;
      factors.push('Previously repaired but issues recurred');
    }

    // Factor 3: Severity trend (worsening over time)
    const hazardScores: Record<string, number> = {
      minor: 1, moderate: 2, significant: 3, dangerous: 4, extremely_dangerous: 5,
    };
    const sorted = clusterReports
      .filter((r) => r.hazard_level)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    if (sorted.length >= 2) {
      const firstHazard = hazardScores[sorted[0].hazard_level] || 0;
      const lastHazard = hazardScores[sorted[sorted.length - 1].hazard_level] || 0;
      if (lastHazard > firstHazard) {
        riskScore += 20;
        factors.push('Severity worsening over time');
      }
    }

    // Factor 4: Seasonal pattern (New England winter damage)
    const now = new Date();
    const month = now.getMonth();
    if (month >= 1 && month <= 4) { // Feb-May = post-winter damage season
      riskScore += 15;
      factors.push('Post-winter damage season (freeze-thaw cycles)');
    }

    // Factor 5: Category-specific patterns
    const topCategory = getMostCommonCategory(clusterReports);
    if (topCategory === 'pothole' && month >= 2 && month <= 5) {
      riskScore += 10;
      factors.push('Pothole-prone area during spring thaw');
    }

    if (riskScore < 20) continue; // Only show meaningful predictions

    predictions.push({
      id: key,
      latitude: clusterLat,
      longitude: clusterLng,
      radius_m: 100,
      predicted_category: topCategory as ReportCategory,
      risk_score: Math.min(riskScore, 100),
      contributing_factors: factors,
      predicted_timeframe: riskScore >= 60 ? 'within 30 days' : 'within 90 days',
      confidence: Math.min(riskScore / 100, 0.85),
      nearby_historical_count: repeatCount,
    });
  }

  return predictions.sort((a, b) => b.risk_score - a.risk_score).slice(0, 20);
}

async function generateLocalHeatmap(
  lat: number,
  lng: number,
  radiusKm: number
): Promise<RiskHeatmapPoint[]> {
  const predictions = await generateLocalPredictions(lat, lng, radiusKm);
  return predictions.map((p) => ({
    latitude: p.latitude,
    longitude: p.longitude,
    weight: p.risk_score / 100,
  }));
}

function getMostCommonCategory(reports: any[]): string {
  const counts: Record<string, number> = {};
  for (const r of reports) {
    counts[r.category] = (counts[r.category] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'pothole';
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
