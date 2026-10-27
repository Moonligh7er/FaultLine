import type {
  AreaGeometry,
  CommercialPropertyContext,
  CorridorGeometry,
  DigitalReportContext,
  InsiderCategory,
  InsiderReportContext,
  MediaAttachment,
  Report,
} from '../types';

// ============================================================
// Extended report types — persistence mapping + validation
//
// Four optional report extensions (digital, insider, commercial, corridor /
// area) map onto the columns added by supabase/migration_019 and
// migration_020. Every column is emitted ONLY when the extension is present,
// so an ordinary point report produces exactly the same insert row as before.
//
// Column map (snake_case, see the migrations for types / constraints):
//   digital    → digital_target_url, digital_assistive_tech, digital_browser,
//                digital_platform, digital_wcag_criterion, digital_snapshot_ref
//   insider    → insider_context (JSONB). A BEFORE INSERT trigger moves it
//                into the private report_insider_context table and nulls the
//                column, so it is never readable through the public reports
//                SELECT policy.
//   commercial → report_subject, commercial_business_name,
//                commercial_business_address, commercial_chain_identifier,
//                commercial_public_view_confirmed,
//                commercial_reporter_attestation
//   corridor   → geometry_type, corridor_geometry (EWKT LineString),
//                corridor_street_name, corridor_from_cross_street,
//                corridor_to_cross_street
//   area       → geometry_type, area_geometry (EWKT Polygon),
//                area_boundary_name, area_census_tract_geoid
//   parentClusterId → parent_cluster_id
// ============================================================

type ExtensionFields = Pick<
  Report,
  'digital' | 'insider' | 'reportSubject' | 'commercial' | 'geometryType' | 'corridor' | 'area' | 'parentClusterId'
>;

type Coord = { latitude: number; longitude: number };

// ── Geometry encoding ────────────────────────────────────────────────────

// PostGIS accepts EWKT text for geometry columns through PostgREST. The SRID
// prefix is required: the columns are typed geometry(…, 4326) and plain WKT
// would arrive as SRID 0 and be rejected. WKT order is "lng lat".
function wktCoord(c: Coord): string {
  return `${c.longitude} ${c.latitude}`;
}

export function corridorToEwkt(corridor: Pick<CorridorGeometry, 'start' | 'end'>): string {
  return `SRID=4326;LINESTRING(${wktCoord(corridor.start)},${wktCoord(corridor.end)})`;
}

// Polygon ring is [[lng, lat], ...]. Closes the ring if the caller didn't.
export function areaToEwkt(area: Pick<AreaGeometry, 'polygon'>): string {
  const ring = [...area.polygon];
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) ring.push(first);
  return `SRID=4326;POLYGON((${ring.map(([lng, lat]) => `${lng} ${lat}`).join(',')}))`;
}

// ── Report → insert columns ──────────────────────────────────────────────

function setIfPresent(row: Record<string, unknown>, key: string, value: unknown) {
  if (value === undefined || value === null) return;
  if (typeof value === 'string' && value.trim() === '') return;
  row[key] = typeof value === 'string' ? value.trim() : value;
}

/**
 * Snake_case insert columns for the extended report fields. Returns an empty
 * object for an ordinary report.
 */
export function buildExtendedColumns(report: ExtensionFields): Record<string, unknown> {
  const row: Record<string, unknown> = {};

  if (report.digital) {
    const d = report.digital;
    setIfPresent(row, 'digital_target_url', d.targetUrl);
    setIfPresent(row, 'digital_assistive_tech', d.assistiveTech);
    setIfPresent(row, 'digital_browser', d.browser);
    setIfPresent(row, 'digital_platform', d.platform);
    setIfPresent(row, 'digital_wcag_criterion', d.wcagCriterion);
    setIfPresent(row, 'digital_snapshot_ref', d.snapshotRef);
  }

  if (report.insider) {
    const i = report.insider;
    const ctx: Record<string, unknown> = { insider_category: i.insiderCategory };
    setIfPresent(ctx, 'observed_duration_days', i.observedDurationDays);
    setIfPresent(ctx, 'prior_internal_report_ref', i.priorInternalReportRef);
    setIfPresent(ctx, 'documentary_reference', i.documentaryReference);
    row.insider_context = ctx;
  }

  if (report.reportSubject === 'commercial_property' && report.commercial) {
    const c = report.commercial;
    row.report_subject = 'commercial_property';
    setIfPresent(row, 'commercial_business_name', c.businessName);
    setIfPresent(row, 'commercial_business_address', c.businessAddressFull);
    setIfPresent(row, 'commercial_chain_identifier', c.chainIdentifier?.toLowerCase());
    row.commercial_public_view_confirmed = c.publicViewConfirmed === true;
    row.commercial_reporter_attestation = c.reporterAttestation === true;
  }

  if (report.geometryType === 'corridor' && report.corridor) {
    const g = report.corridor;
    row.geometry_type = 'corridor';
    row.corridor_geometry = corridorToEwkt(g);
    setIfPresent(row, 'corridor_street_name', g.streetName);
    setIfPresent(row, 'corridor_from_cross_street', g.fromCrossStreet);
    setIfPresent(row, 'corridor_to_cross_street', g.toCrossStreet);
  } else if (report.geometryType === 'area' && report.area) {
    const a = report.area;
    row.geometry_type = 'area';
    row.area_geometry = areaToEwkt(a);
    setIfPresent(row, 'area_boundary_name', a.boundaryName);
    setIfPresent(row, 'area_census_tract_geoid', a.censusTractGeoid);
  }

  setIfPresent(row, 'parent_cluster_id', report.parentClusterId);

  return row;
}

/**
 * Commercial reports are hidden from the public reports SELECT policy
 * (migration 020), so an anonymous insert can't read its own row back.
 * Those inserts skip RETURNING and the Report is built from the input.
 */
export function needsMinimalReturn(report: ExtensionFields): boolean {
  return report.reportSubject === 'commercial_property' && Boolean(report.commercial);
}

// ── DB row → Report extension fields ─────────────────────────────────────

// PostgREST returns geometry as GeoJSON (object, or a JSON string of one).
// Anything else (e.g. hex EWKB) is left unparsed.
function parseGeoJson(value: unknown): { type?: string; coordinates?: any } | null {
  if (!value) return null;
  if (typeof value === 'object') return value as any;
  if (typeof value === 'string' && value.trim().startsWith('{')) {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
}

export function mapExtendedColumns(row: any): Partial<ExtensionFields> {
  const out: Partial<ExtensionFields> = {};
  if (!row) return out;

  if (row.digital_target_url) {
    const digital: DigitalReportContext = { targetUrl: row.digital_target_url };
    if (row.digital_assistive_tech) digital.assistiveTech = row.digital_assistive_tech;
    if (row.digital_browser) digital.browser = row.digital_browser;
    if (row.digital_platform) digital.platform = row.digital_platform;
    if (row.digital_wcag_criterion) digital.wcagCriterion = row.digital_wcag_criterion;
    if (row.digital_snapshot_ref) digital.snapshotRef = row.digital_snapshot_ref;
    out.digital = digital;
  }

  if (row.report_subject === 'commercial_property') {
    out.reportSubject = 'commercial_property';
    const commercial: CommercialPropertyContext = {
      businessName: row.commercial_business_name ?? '',
      businessAddressFull: row.commercial_business_address ?? '',
      publicViewConfirmed: row.commercial_public_view_confirmed === true,
      reporterAttestation: row.commercial_reporter_attestation === true,
    };
    if (row.commercial_chain_identifier) commercial.chainIdentifier = row.commercial_chain_identifier;
    out.commercial = commercial;
  }

  if (row.geometry_type === 'corridor' || row.geometry_type === 'area') {
    out.geometryType = row.geometry_type;
  }

  if (row.geometry_type === 'corridor') {
    const geo = parseGeoJson(row.corridor_geometry);
    const coords = geo?.type === 'LineString' ? geo.coordinates : null;
    if (Array.isArray(coords) && coords.length >= 2) {
      const [sLng, sLat] = coords[0];
      const [eLng, eLat] = coords[coords.length - 1];
      const corridor: CorridorGeometry = {
        start: { latitude: sLat, longitude: sLng },
        end: { latitude: eLat, longitude: eLng },
      };
      if (row.corridor_street_name) corridor.streetName = row.corridor_street_name;
      if (row.corridor_from_cross_street) corridor.fromCrossStreet = row.corridor_from_cross_street;
      if (row.corridor_to_cross_street) corridor.toCrossStreet = row.corridor_to_cross_street;
      out.corridor = corridor;
    }
  }

  if (row.geometry_type === 'area') {
    const geo = parseGeoJson(row.area_geometry);
    const ring = geo?.type === 'Polygon' && Array.isArray(geo.coordinates) ? geo.coordinates[0] : null;
    if (Array.isArray(ring) && ring.length >= 4) {
      const area: AreaGeometry = { polygon: ring.map(([lng, lat]: number[]) => [lng, lat] as [number, number]) };
      if (row.area_boundary_name) area.boundaryName = row.area_boundary_name;
      if (row.area_census_tract_geoid) area.censusTractGeoid = row.area_census_tract_geoid;
      out.area = area;
    }
  }

  if (row.parent_cluster_id) out.parentClusterId = row.parent_cluster_id;

  return out;
}

// ── Validation (used by ReportScreen before advancing / submitting) ──────
// Each returns a list of user-facing problems; empty list = valid.

const URL_RE = /^https?:\/\/[^\s/?#]+\.[^\s/?#]+(?:[/?#]\S*)?$/i;

/** Trim and default to https:// when the user omitted the scheme. */
export function normalizeUrl(input: string | undefined): string {
  const trimmed = (input ?? '').trim();
  if (!trimmed) return '';
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function validateDigital(value: Partial<DigitalReportContext>): string[] {
  const url = normalizeUrl(value.targetUrl);
  if (!url) return ['Enter the URL of the broken page or resource.'];
  if (!URL_RE.test(url)) return ['Enter a full web address, e.g. https://city.gov/permits.'];
  if (url.length > 2048) return ['That URL is too long (2048 characters max).'];
  return [];
}

const INSIDER_CATEGORY_KEYS: ReadonlyArray<InsiderCategory> = [
  'public_works', 'facilities', 'it', 'transit', 'public_housing', 'schools', 'code_enforcement', 'other',
];

export function validateInsider(
  value: Partial<InsiderReportContext>,
  media: MediaAttachment[] = [],
): string[] {
  const errors: string[] = [];
  if (!value.insiderCategory || !INSIDER_CATEGORY_KEYS.includes(value.insiderCategory)) {
    errors.push('Choose the functional area that gives you visibility.');
  }
  const days = value.observedDurationDays;
  if (days !== undefined && (!Number.isInteger(days) || days < 0 || days > 36500)) {
    errors.push('Observed duration must be a whole number of days.');
  }
  // Photos are re-encoded before upload (media.ts), which drops EXIF. Videos
  // are uploaded as-is and keep device / location metadata.
  if (media.some((m) => m.type === 'video')) {
    errors.push('Videos keep device and location metadata. Remove videos from an insider report, or attach photos instead.');
  }
  return errors;
}

export function validateCommercial(value: Partial<CommercialPropertyContext>): string[] {
  const errors: string[] = [];
  if (!value.businessName?.trim()) errors.push('Enter the business name.');
  if (!value.businessAddressFull?.trim()) errors.push('Enter the full business address.');
  if (value.publicViewConfirmed !== true) errors.push('Confirm you observed this from public view.');
  if (value.reporterAttestation !== true) errors.push('Confirm this is a factual observation of a physical condition.');
  return errors;
}

// Below this, start and end are the same spot (GPS noise), not a segment.
export const MIN_CORRIDOR_LENGTH_M = 10;

export function distanceMeters(a: Coord, b: Coord): number {
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.latitude * Math.PI) / 180) * Math.cos((b.latitude * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function validateCorridor(value: Partial<CorridorGeometry>): string[] {
  const errors: string[] = [];
  if (!value.streetName?.trim()) errors.push('Enter the street name.');
  if (!value.start) errors.push('Set the start point of the stretch.');
  if (!value.end) errors.push('Set the end point of the stretch.');
  if (value.start && value.end && distanceMeters(value.start, value.end) < MIN_CORRIDOR_LENGTH_M) {
    errors.push(`Start and end are less than ${MIN_CORRIDOR_LENGTH_M} m apart. Move along the street before setting the end point.`);
  }
  return errors;
}
