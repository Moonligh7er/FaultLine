import { supabase } from './supabase';

// ============================================================
// Election District Overlay
// Maps infrastructure reports to political districts.
// Shows which representatives' areas get fixed fastest.
// ============================================================

export interface DistrictData {
  districtId: string;
  districtName: string;
  representative: string;
  party?: string;
  contactEmail?: string;
  contactPhone?: string;
  totalReports: number;
  unresolvedReports: number;
  resolvedReports: number;
  avgResponseDays: number;
  fixRatePercent: number;
  topIssues: { category: string; count: number }[];
}

// Census TIGER/Line shapefiles provide district boundaries
// For MVP, we use a city council ward lookup via geocoding
export async function getDistrictForLocation(
  lat: number,
  lng: number,
  state: string,
  city?: string,
): Promise<DistrictData | null> {
  // Try Supabase lookup first (if we have district boundary data)
  const { data } = await supabase
    .from('election_districts')
    .select('*')
    .limit(1);

  // If no district table exists yet, use Census Geocoder API
  if (!data || data.length === 0) {
    return fetchFromCensusGeocoder(lat, lng);
  }

  return null;
}

async function fetchFromCensusGeocoder(lat: number, lng: number): Promise<DistrictData | null> {
  try {
    // Census Bureau Geocoder — free, no API key needed
    const url = `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${lng}&y=${lat}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;

    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    const geographies = data?.result?.geographies;

    if (!geographies) return null;

    // Extract state legislative districts and congressional districts
    const stateLower = geographies['State Legislative Districts - Lower']?.[0];
    const stateUpper = geographies['State Legislative Districts - Upper']?.[0];
    const congressional = geographies['Congressional Districts']?.[0];
    const county = geographies['Counties']?.[0];

    const districtName = stateLower?.NAME || stateUpper?.NAME || congressional?.NAME || 'Unknown District';
    const districtId = stateLower?.GEOID || stateUpper?.GEOID || congressional?.GEOID || '';

    return {
      districtId,
      districtName,
      representative: 'Look up at legislature website', // Would need a separate API for rep names
      totalReports: 0,
      unresolvedReports: 0,
      resolvedReports: 0,
      avgResponseDays: 0,
      fixRatePercent: 0,
      topIssues: [],
    };
  } catch {
    return null;
  }
}

// Get report stats aggregated by district for a city
export async function getDistrictComparison(
  state: string,
  city?: string,
): Promise<DistrictData[]> {
  // Aggregate reports by geographic grid cells as proxy for districts
  const { data: reports } = await supabase
    .from('reports')
    .select('latitude, longitude, category, status, hazard_level, created_at, resolved_at')
    .eq('state', state)
    .not('city', 'is', null);

  if (!reports || reports.length === 0) return [];

  // Group into rough district-sized areas (0.01 degree ≈ 1km grid)
  const gridSize = 0.01;
  const districts: Map<string, typeof reports> = new Map();

  for (const report of reports) {
    const key = `${Math.round(report.latitude / gridSize) * gridSize},${Math.round(report.longitude / gridSize) * gridSize}`;
    if (!districts.has(key)) districts.set(key, []);
    districts.get(key)!.push(report);
  }

  return Array.from(districts.entries())
    .filter(([_, reports]) => reports.length >= 3)
    .map(([key, distReports]) => {
      const total = distReports.length;
      const resolved = distReports.filter((r) => r.status === 'resolved').length;
      const unresolved = total - resolved;

      const responseTimes = distReports
        .filter((r) => r.resolved_at)
        .map((r) => (new Date(r.resolved_at).getTime() - new Date(r.created_at).getTime()) / 86400000);
      const avgResponse = responseTimes.length > 0
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0;

      const catCounts: Record<string, number> = {};
      distReports.forEach((r) => { catCounts[r.category] = (catCounts[r.category] || 0) + 1; });
      const topIssues = Object.entries(catCounts)
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);

      return {
        districtId: key,
        districtName: `Area ${key}`,
        representative: '',
        totalReports: total,
        unresolvedReports: unresolved,
        resolvedReports: resolved,
        avgResponseDays: Math.round(avgResponse),
        fixRatePercent: total > 0 ? Math.round((resolved / total) * 100) : 0,
        topIssues,
      };
    })
    .sort((a, b) => a.fixRatePercent - b.fixRatePercent);
}
