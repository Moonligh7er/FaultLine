import type {
  Report,
  ReportLocation,
  CorridorGeometry,
  AreaGeometry,
} from '../types';

// ============================================================
// Corridor & Area Auto-Suggestion + Weighting
//
// Detects point-report clusters that look like they should be a corridor
// or area report. Publishes suggestions to the app UI; community members
// accept them (algorithm never auto-promotes). See /corridor-reports for
// the design.
//
// Also exports the Shame Index weight modifier for corridor/area reports
// (currently 3x per the published methodology).
// ============================================================

// Thresholds — match the /corridor-reports methodology page.
export const CORRIDOR_THRESHOLDS = {
  minReports: 5,
  minDistinctPoints: 3,
  minDistinctPointsMeters: 30.5, // ~100 ft
  maxCorridorMeters: 800,        // ~500 ft window for clustering
  windowDays: 60,
} as const;

export const AREA_THRESHOLDS = {
  minReports: 8,
  minDistinctPoints: 5,
  minDistinctPointsMeters: 61,   // ~200 ft
  windowDays: 60,
} as const;

// Shame Index weight modifier — corridor reports count as ~3x point reports
// in the aggregate score to prevent accountability-arbitrage where 10 point
// closures paper over an ongoing corridor failure. Value calibrated
// empirically once the first pilot city has enough data; ships at 3.0 per
// the published methodology.
export const CORRIDOR_SHAME_INDEX_WEIGHT = 3.0;
export const AREA_SHAME_INDEX_WEIGHT = 3.5;

export interface CorridorSuggestion {
  suggestionId: string;
  suggestedGeometry: CorridorGeometry;
  underlyingReportIds: string[];
  distinctReporterCount: number;
  distinctGpsPointCount: number;
  categoryDistribution: Record<string, number>;
  suggestedAt: string;   // ISO
  confidence: 'high' | 'medium' | 'low';
}

export interface AreaSuggestion {
  suggestionId: string;
  suggestedGeometry: AreaGeometry;
  underlyingReportIds: string[];
  distinctReporterCount: number;
  distinctGpsPointCount: number;
  categoryDistribution: Record<string, number>;
  suggestedAt: string;
  confidence: 'high' | 'medium' | 'low';
}

// ── Distance helpers ──────────────────────────────────────────────────────

// Haversine distance in meters between two GPS coordinates.
export function haversineMeters(a: ReportLocation, b: ReportLocation): number {
  const R = 6371000; // Earth radius in meters
  const phi1 = (a.latitude * Math.PI) / 180;
  const phi2 = (b.latitude * Math.PI) / 180;
  const dphi = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dlambda = ((b.longitude - a.longitude) * Math.PI) / 180;
  const s =
    Math.sin(dphi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlambda / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// ── Suggestion algorithm ──────────────────────────────────────────────────

/**
 * Given a set of point reports, produce corridor suggestions.
 *
 * Approach (heuristic v1 — refined against real data during pilot):
 *   1. Only consider reports in the trailing window (windowDays).
 *   2. Group reports by street name if available; else by GPS proximity clusters.
 *   3. For each candidate group, check thresholds: minReports, minDistinctPoints
 *      with minDistinctPointsMeters separation, and reporter distinctness.
 *   4. Fit a linear geometry (start = min-latitude point, end = max-latitude
 *      point in the same street group; refine with street network data when
 *      pilot city provides it).
 *
 * Returns suggestions; consumers decide whether to surface them in the UI.
 */
export function suggestCorridors(reports: Report[]): CorridorSuggestion[] {
  const now = Date.now();
  const windowMs = CORRIDOR_THRESHOLDS.windowDays * 86400000;
  const recentPoints = reports.filter(
    (r) =>
      (r.geometryType === 'point' || r.geometryType === undefined) &&
      now - Date.parse(r.createdAt) <= windowMs,
  );

  // Group by streetName if available on location.address; else fall through to
  // proximity-only grouping.
  const grouped = new Map<string, Report[]>();
  for (const r of recentPoints) {
    const street = extractStreetName(r.location.address) ?? '__nostreet__';
    if (!grouped.has(street)) grouped.set(street, []);
    grouped.get(street)!.push(r);
  }

  const suggestions: CorridorSuggestion[] = [];
  for (const [street, group] of grouped) {
    if (group.length < CORRIDOR_THRESHOLDS.minReports) continue;

    // Distinct-points check: cluster GPS coords within minDistinctPointsMeters.
    const distinctPoints = clusterDistinctPoints(
      group.map((r) => r.location),
      CORRIDOR_THRESHOLDS.minDistinctPointsMeters,
    );
    if (distinctPoints.length < CORRIDOR_THRESHOLDS.minDistinctPoints) continue;

    // Distinct-reporter check.
    const reporters = new Set(group.map((r) => r.userId || r.id));
    if (reporters.size < 3) continue; // Need at least 3 distinct reporters even below the minReports bar

    // Fit start/end from northernmost + southernmost distinct points as a
    // first-pass linear approximation. Real implementation refines against
    // OSM street geometry once pilot city provides the data.
    const sortedByLat = [...distinctPoints].sort((a, b) => a.latitude - b.latitude);
    const start = sortedByLat[0];
    const end = sortedByLat[sortedByLat.length - 1];

    const categoryDist: Record<string, number> = {};
    for (const r of group) {
      categoryDist[r.category] = (categoryDist[r.category] || 0) + 1;
    }

    suggestions.push({
      suggestionId: `corridor-${street}-${Date.now()}`,
      suggestedGeometry: {
        start: { latitude: start.latitude, longitude: start.longitude },
        end: { latitude: end.latitude, longitude: end.longitude },
        streetName: street === '__nostreet__' ? undefined : street,
      },
      underlyingReportIds: group.map((r) => r.id),
      distinctReporterCount: reporters.size,
      distinctGpsPointCount: distinctPoints.length,
      categoryDistribution: categoryDist,
      suggestedAt: new Date().toISOString(),
      confidence: distinctPoints.length >= 5 && reporters.size >= 5 ? 'high' : 'medium',
    });
  }

  return suggestions;
}

/**
 * Given a set of point reports and a set of pre-defined area boundaries
 * (typically census tracts for the jurisdiction), produce area suggestions.
 */
export function suggestAreas(
  reports: Report[],
  areaBoundaries: Array<{ boundaryName: string; polygon: Array<[number, number]>; censusTractGeoid?: string }>,
): AreaSuggestion[] {
  const now = Date.now();
  const windowMs = AREA_THRESHOLDS.windowDays * 86400000;
  const recentPoints = reports.filter(
    (r) =>
      (r.geometryType === 'point' || r.geometryType === undefined) &&
      now - Date.parse(r.createdAt) <= windowMs,
  );

  const suggestions: AreaSuggestion[] = [];
  for (const boundary of areaBoundaries) {
    const within = recentPoints.filter((r) =>
      pointInPolygon([r.location.longitude, r.location.latitude], boundary.polygon),
    );
    if (within.length < AREA_THRESHOLDS.minReports) continue;

    const distinctPoints = clusterDistinctPoints(
      within.map((r) => r.location),
      AREA_THRESHOLDS.minDistinctPointsMeters,
    );
    if (distinctPoints.length < AREA_THRESHOLDS.minDistinctPoints) continue;

    const reporters = new Set(within.map((r) => r.userId || r.id));
    if (reporters.size < 5) continue;

    const categoryDist: Record<string, number> = {};
    for (const r of within) {
      categoryDist[r.category] = (categoryDist[r.category] || 0) + 1;
    }

    suggestions.push({
      suggestionId: `area-${boundary.boundaryName}-${Date.now()}`,
      suggestedGeometry: {
        polygon: boundary.polygon,
        boundaryName: boundary.boundaryName,
        censusTractGeoid: boundary.censusTractGeoid,
      },
      underlyingReportIds: within.map((r) => r.id),
      distinctReporterCount: reporters.size,
      distinctGpsPointCount: distinctPoints.length,
      categoryDistribution: categoryDist,
      suggestedAt: new Date().toISOString(),
      confidence:
        distinctPoints.length >= 8 && reporters.size >= 8 ? 'high' : 'medium',
    });
  }

  return suggestions;
}

// ── Shame Index weight helper ─────────────────────────────────────────────

/**
 * Return the Shame Index weight for a report based on its geometry type.
 * Consumers of the Shame Index calculation should multiply per-report
 * contribution by this weight to prevent accountability-arbitrage.
 */
export function shameIndexWeight(report: Report): number {
  switch (report.geometryType) {
    case 'corridor':
      return CORRIDOR_SHAME_INDEX_WEIGHT;
    case 'area':
      return AREA_SHAME_INDEX_WEIGHT;
    case 'point':
    case undefined:
    default:
      return 1.0;
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────

function extractStreetName(address: string | undefined): string | undefined {
  if (!address) return undefined;
  // Strip leading house number if present; return the rest.
  const withoutNumber = address.replace(/^\d+\s+/, '').trim();
  // Take the first comma-separated segment (typically "Beacon St").
  return withoutNumber.split(',')[0].trim() || undefined;
}

function clusterDistinctPoints(
  locations: ReportLocation[],
  minSeparationMeters: number,
): ReportLocation[] {
  // Simple greedy clustering: for each location, if it's within
  // minSeparationMeters of any already-selected point, skip it.
  const selected: ReportLocation[] = [];
  for (const loc of locations) {
    const tooClose = selected.some(
      (sel) => haversineMeters(loc, sel) < minSeparationMeters,
    );
    if (!tooClose) selected.push(loc);
  }
  return selected;
}

function pointInPolygon(
  point: [number, number],
  polygon: Array<[number, number]>,
): boolean {
  // Ray-casting algorithm. Coordinates in [lng, lat] order.
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
