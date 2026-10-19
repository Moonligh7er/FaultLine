import {
  haversineMeters,
  suggestCorridors,
  suggestAreas,
  shameIndexWeight,
  CORRIDOR_THRESHOLDS,
  AREA_THRESHOLDS,
  CORRIDOR_SHAME_INDEX_WEIGHT,
  AREA_SHAME_INDEX_WEIGHT,
} from '../corridorAggregation';
import { makeReport } from './fixtures';
import type { Report } from '../../types';

// ~111 m per 0.001 deg latitude.
const BASE_LAT = 42.35;
const BASE_LNG = -71.06;

function pointReports(
  n: number,
  opts: { spacingDeg?: number; reporters?: number; street?: string; ageDays?: number } = {},
): Report[] {
  const { spacingDeg = 0.001, reporters = n, street = 'Beacon St', ageDays = 1 } = opts;
  return Array.from({ length: n }, (_, i) =>
    makeReport({
      id: `r${i}`,
      userId: `u${i % reporters}`,
      createdAt: new Date(Date.now() - ageDays * 86400000).toISOString(),
      location: {
        latitude: BASE_LAT + i * spacingDeg,
        longitude: BASE_LNG,
        address: `${100 + i} ${street}, Boston, MA`,
        city: 'Boston',
        state: 'MA',
      },
    }),
  );
}

describe('haversineMeters', () => {
  it('is 0 for the same point', () => {
    const p = { latitude: BASE_LAT, longitude: BASE_LNG };
    expect(haversineMeters(p, p)).toBe(0);
  });
  it('is ~111 m for 0.001 deg latitude', () => {
    const d = haversineMeters({ latitude: 0, longitude: 0 }, { latitude: 0.001, longitude: 0 });
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });
});

describe('suggestCorridors thresholds', () => {
  it('suggests a corridor at exactly minReports distinct points/reporters', () => {
    const s = suggestCorridors(pointReports(CORRIDOR_THRESHOLDS.minReports));
    expect(s).toHaveLength(1);
    expect(s[0].suggestedGeometry.streetName).toBe('Beacon St');
    expect(s[0].underlyingReportIds).toHaveLength(5);
    expect(s[0].suggestedGeometry.start.latitude).toBeCloseTo(BASE_LAT);
    expect(s[0].suggestedGeometry.end.latitude).toBeCloseTo(BASE_LAT + 0.004);
    expect(s[0].confidence).toBe('high');
  });

  it('rejects groups below minReports', () => {
    expect(suggestCorridors(pointReports(CORRIDOR_THRESHOLDS.minReports - 1))).toEqual([]);
  });

  it('rejects groups whose points are within minDistinctPointsMeters of each other', () => {
    // 0.0001 deg ~ 11 m apart: all collapse into fewer than 3 distinct points.
    expect(suggestCorridors(pointReports(6, { spacingDeg: 0.0001 }))).toEqual([]);
  });

  it('rejects groups with fewer than 3 distinct reporters', () => {
    expect(suggestCorridors(pointReports(6, { reporters: 2 }))).toEqual([]);
  });

  it('gives medium confidence below 5 reporters', () => {
    const s = suggestCorridors(pointReports(6, { reporters: 3 }));
    expect(s).toHaveLength(1);
    expect(s[0].confidence).toBe('medium');
  });

  it('ignores reports outside the window and non-point reports', () => {
    expect(suggestCorridors(pointReports(6, { ageDays: CORRIDOR_THRESHOLDS.windowDays + 1 }))).toEqual([]);
    const corridors = pointReports(6).map((r) => ({ ...r, geometryType: 'corridor' as const }));
    expect(suggestCorridors(corridors)).toEqual([]);
  });

  it('groups by street name (house numbers stripped)', () => {
    const s = suggestCorridors([...pointReports(5, { street: 'Beacon St' }), ...pointReports(4, { street: 'Main St' })]);
    expect(s.map((x) => x.suggestedGeometry.streetName)).toEqual(['Beacon St']);
  });
});

describe('suggestAreas thresholds', () => {
  // Square ~0.01 deg around the base point, [lng, lat] order.
  const boundary = {
    boundaryName: 'Tract 1',
    censusTractGeoid: '25025000100',
    polygon: [
      [BASE_LNG - 0.005, BASE_LAT - 0.005],
      [BASE_LNG + 0.005, BASE_LAT - 0.005],
      [BASE_LNG + 0.005, BASE_LAT + 0.015],
      [BASE_LNG - 0.005, BASE_LAT + 0.015],
    ] as Array<[number, number]>,
  };

  it('suggests an area at minReports inside the polygon', () => {
    const s = suggestAreas(pointReports(AREA_THRESHOLDS.minReports), [boundary]);
    expect(s).toHaveLength(1);
    expect(s[0].suggestedGeometry.censusTractGeoid).toBe('25025000100');
    expect(s[0].confidence).toBe('high');
  });

  it('rejects below minReports', () => {
    expect(suggestAreas(pointReports(AREA_THRESHOLDS.minReports - 1), [boundary])).toEqual([]);
  });

  it('rejects with fewer than 5 distinct reporters', () => {
    expect(suggestAreas(pointReports(10, { reporters: 4 }), [boundary])).toEqual([]);
  });

  it('ignores points outside the polygon', () => {
    const far = pointReports(10).map((r) => ({ ...r, location: { ...r.location, longitude: BASE_LNG + 1 } }));
    expect(suggestAreas(far, [boundary])).toEqual([]);
  });
});

describe('shameIndexWeight', () => {
  it('weights by geometry type', () => {
    expect(shameIndexWeight(makeReport())).toBe(1);
    expect(shameIndexWeight(makeReport({ geometryType: 'point' }))).toBe(1);
    expect(shameIndexWeight(makeReport({ geometryType: 'corridor' }))).toBe(CORRIDOR_SHAME_INDEX_WEIGHT);
    expect(shameIndexWeight(makeReport({ geometryType: 'area' }))).toBe(AREA_SHAME_INDEX_WEIGHT);
    expect(CORRIDOR_SHAME_INDEX_WEIGHT).toBe(3);
  });
});
