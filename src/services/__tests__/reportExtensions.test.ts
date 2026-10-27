import {
  buildExtendedColumns,
  mapExtendedColumns,
  needsMinimalReturn,
  corridorToEwkt,
  areaToEwkt,
  normalizeUrl,
  validateDigital,
  validateInsider,
  validateCommercial,
  validateCorridor,
  distanceMeters,
} from '../reportExtensions';
import {
  makeDigitalContext,
  makeInsiderContext,
  makeCommercialContext,
  makeCorridorGeometry,
} from './fixtures';

describe('buildExtendedColumns', () => {
  it('returns no columns for an ordinary point report', () => {
    expect(buildExtendedColumns({})).toEqual({});
    expect(buildExtendedColumns({ reportSubject: 'public_infrastructure', geometryType: 'point' })).toEqual({});
  });

  it('maps digital context to digital_* columns, omitting absent optionals', () => {
    expect(buildExtendedColumns({ digital: { targetUrl: 'https://city.gov/form' } })).toEqual({
      digital_target_url: 'https://city.gov/form',
    });
    expect(buildExtendedColumns({ digital: makeDigitalContext() })).toEqual({
      digital_target_url: 'https://www.boston.gov/permits/apply',
      digital_assistive_tech: 'NVDA',
      digital_browser: 'Firefox',
      digital_platform: 'Windows',
      digital_wcag_criterion: '4.1.2',
      digital_snapshot_ref: 'snap/abc',
    });
  });

  it('drops blank optional strings', () => {
    const row = buildExtendedColumns({ digital: { targetUrl: ' https://a.gov ', browser: '  ', platform: '' } });
    expect(row).toEqual({ digital_target_url: 'https://a.gov' });
  });

  it('maps insider context to a snake_case insider_context object', () => {
    expect(buildExtendedColumns({ insider: makeInsiderContext() })).toEqual({
      insider_context: {
        insider_category: 'public_works',
        observed_duration_days: 540,
        prior_internal_report_ref: 'Internal ticket 2024-03-15',
        documentary_reference: 'Work order #12345',
      },
    });
  });

  it('keeps observed_duration_days = 0 and omits missing insider optionals', () => {
    expect(
      buildExtendedColumns({ insider: { insiderCategory: 'it', observedDurationDays: 0 } }),
    ).toEqual({ insider_context: { insider_category: 'it', observed_duration_days: 0 } });
    expect(buildExtendedColumns({ insider: { insiderCategory: 'transit' } })).toEqual({
      insider_context: { insider_category: 'transit' },
    });
  });

  it('maps commercial context only when reportSubject is commercial_property', () => {
    const commercial = makeCommercialContext({ chainIdentifier: 'CVS' });
    expect(buildExtendedColumns({ commercial })).toEqual({});
    expect(buildExtendedColumns({ reportSubject: 'public_infrastructure', commercial })).toEqual({});
    expect(buildExtendedColumns({ reportSubject: 'commercial_property', commercial })).toEqual({
      report_subject: 'commercial_property',
      commercial_business_name: 'Riverdale Retail Center',
      commercial_business_address: '123 Main St, Springfield, MA 01103',
      commercial_chain_identifier: 'cvs',
      commercial_public_view_confirmed: true,
      commercial_reporter_attestation: true,
    });
  });

  it('never sends a truthy attestation the user did not give', () => {
    const row = buildExtendedColumns({
      reportSubject: 'commercial_property',
      commercial: makeCommercialContext({ publicViewConfirmed: undefined as any, reporterAttestation: false }),
    });
    expect(row.commercial_public_view_confirmed).toBe(false);
    expect(row.commercial_reporter_attestation).toBe(false);
  });

  it('maps a corridor to geometry_type + EWKT LineString (lng lat order) + street columns', () => {
    expect(buildExtendedColumns({ geometryType: 'corridor', corridor: makeCorridorGeometry() })).toEqual({
      geometry_type: 'corridor',
      corridor_geometry: 'SRID=4326;LINESTRING(-71.0589 42.3601,-71.0612 42.3622)',
      corridor_street_name: 'Beacon Street',
      corridor_from_cross_street: 'Park St',
      corridor_to_cross_street: 'Charles St',
    });
  });

  it('ignores a corridor object unless geometryType is corridor', () => {
    expect(buildExtendedColumns({ corridor: makeCorridorGeometry() })).toEqual({});
    expect(buildExtendedColumns({ geometryType: 'point', corridor: makeCorridorGeometry() })).toEqual({});
  });

  it('maps an area to geometry_type + closed EWKT Polygon', () => {
    const row = buildExtendedColumns({
      geometryType: 'area',
      area: { polygon: [[-71, 42], [-71.1, 42], [-71.1, 42.1]], boundaryName: 'Back Bay', censusTractGeoid: '25025010802' },
    });
    expect(row).toEqual({
      geometry_type: 'area',
      area_geometry: 'SRID=4326;POLYGON((-71 42,-71.1 42,-71.1 42.1,-71 42))',
      area_boundary_name: 'Back Bay',
      area_census_tract_geoid: '25025010802',
    });
  });

  it('maps parentClusterId', () => {
    expect(buildExtendedColumns({ parentClusterId: 'c-1' })).toEqual({ parent_cluster_id: 'c-1' });
  });

  it('combines several extensions in one row', () => {
    const row = buildExtendedColumns({
      digital: { targetUrl: 'https://a.gov' },
      insider: { insiderCategory: 'it' },
      geometryType: 'corridor',
      corridor: makeCorridorGeometry(),
    });
    expect(Object.keys(row).sort()).toEqual([
      'corridor_from_cross_street', 'corridor_geometry', 'corridor_street_name',
      'corridor_to_cross_street', 'digital_target_url', 'geometry_type', 'insider_context',
    ]);
  });
});

describe('EWKT helpers', () => {
  it('corridorToEwkt uses SRID 4326 and lng-lat order', () => {
    expect(corridorToEwkt({ start: { latitude: 1, longitude: 2 }, end: { latitude: 3, longitude: 4 } })).toBe(
      'SRID=4326;LINESTRING(2 1,4 3)',
    );
  });

  it('areaToEwkt leaves an already-closed ring alone', () => {
    expect(areaToEwkt({ polygon: [[0, 0], [1, 0], [1, 1], [0, 0]] })).toBe('SRID=4326;POLYGON((0 0,1 0,1 1,0 0))');
  });
});

describe('needsMinimalReturn', () => {
  it('is true only for commercial reports', () => {
    expect(needsMinimalReturn({})).toBe(false);
    expect(needsMinimalReturn({ insider: makeInsiderContext() })).toBe(false);
    expect(needsMinimalReturn({ reportSubject: 'commercial_property' })).toBe(false);
    expect(needsMinimalReturn({ reportSubject: 'commercial_property', commercial: makeCommercialContext() })).toBe(true);
  });
});

describe('mapExtendedColumns', () => {
  it('returns nothing for an ordinary row', () => {
    expect(mapExtendedColumns({ id: 'r1', geometry_type: 'point', report_subject: 'public_infrastructure' })).toEqual({});
    expect(mapExtendedColumns(null)).toEqual({});
  });

  it('maps digital columns back', () => {
    expect(mapExtendedColumns({ digital_target_url: 'https://a.gov', digital_wcag_criterion: '1.1.1' })).toEqual({
      digital: { targetUrl: 'https://a.gov', wcagCriterion: '1.1.1' },
    });
  });

  it('maps commercial columns back', () => {
    expect(
      mapExtendedColumns({
        report_subject: 'commercial_property',
        commercial_business_name: 'Shop',
        commercial_business_address: '1 Main St',
        commercial_chain_identifier: 'cvs',
        commercial_public_view_confirmed: true,
        commercial_reporter_attestation: true,
      }),
    ).toEqual({
      reportSubject: 'commercial_property',
      commercial: {
        businessName: 'Shop',
        businessAddressFull: '1 Main St',
        chainIdentifier: 'cvs',
        publicViewConfirmed: true,
        reporterAttestation: true,
      },
    });
  });

  it('parses a GeoJSON LineString corridor (object or string)', () => {
    const geo = { type: 'LineString', coordinates: [[-71.0589, 42.3601], [-71.0612, 42.3622]] };
    const expected = {
      geometryType: 'corridor',
      corridor: {
        start: { latitude: 42.3601, longitude: -71.0589 },
        end: { latitude: 42.3622, longitude: -71.0612 },
        streetName: 'Beacon Street',
      },
    };
    expect(mapExtendedColumns({ geometry_type: 'corridor', corridor_geometry: geo, corridor_street_name: 'Beacon Street' })).toEqual(expected);
    expect(
      mapExtendedColumns({ geometry_type: 'corridor', corridor_geometry: JSON.stringify(geo), corridor_street_name: 'Beacon Street' }),
    ).toEqual(expected);
  });

  it('keeps geometryType but skips unparseable geometry (hex EWKB)', () => {
    expect(mapExtendedColumns({ geometry_type: 'corridor', corridor_geometry: '0102000020E6100000' })).toEqual({
      geometryType: 'corridor',
    });
  });

  it('parses a GeoJSON Polygon area', () => {
    const ring = [[0, 0], [1, 0], [1, 1], [0, 0]];
    expect(mapExtendedColumns({ geometry_type: 'area', area_geometry: { type: 'Polygon', coordinates: [ring] } })).toEqual({
      geometryType: 'area',
      area: { polygon: ring },
    });
  });

  it('never surfaces insider_context from a row', () => {
    expect(mapExtendedColumns({ insider_context: { insider_category: 'it' } })).toEqual({});
  });
});

describe('normalizeUrl / validateDigital', () => {
  it('adds https:// when the scheme is missing and trims', () => {
    expect(normalizeUrl('  city.gov/permits ')).toBe('https://city.gov/permits');
    expect(normalizeUrl('http://city.gov')).toBe('http://city.gov');
    expect(normalizeUrl(undefined)).toBe('');
  });

  it('requires a URL', () => {
    expect(validateDigital({})).toHaveLength(1);
    expect(validateDigital({ targetUrl: '   ' })).toHaveLength(1);
  });

  it('rejects non-web addresses', () => {
    expect(validateDigital({ targetUrl: 'not a url' })).toHaveLength(1);
    expect(validateDigital({ targetUrl: 'ftp://city.gov/file.pdf' })).toHaveLength(1);
    expect(validateDigital({ targetUrl: 'https://localhost' })).toHaveLength(1);
  });

  it('accepts full and scheme-less addresses', () => {
    expect(validateDigital({ targetUrl: 'https://www.boston.gov/permits/apply?x=1#top' })).toEqual([]);
    expect(validateDigital({ targetUrl: 'boston.gov/311' })).toEqual([]);
  });

  it('rejects URLs over 2048 characters (DB check)', () => {
    expect(validateDigital({ targetUrl: `https://a.gov/${'x'.repeat(2048)}` })).toHaveLength(1);
  });
});

describe('validateInsider', () => {
  it('requires an insider category', () => {
    expect(validateInsider({})).toHaveLength(1);
    expect(validateInsider({ insiderCategory: 'bogus' as any })).toHaveLength(1);
    expect(validateInsider({ insiderCategory: 'schools' })).toEqual([]);
  });

  it('rejects negative or fractional durations', () => {
    expect(validateInsider({ insiderCategory: 'it', observedDurationDays: -1 })).toHaveLength(1);
    expect(validateInsider({ insiderCategory: 'it', observedDurationDays: 1.5 })).toHaveLength(1);
    expect(validateInsider({ insiderCategory: 'it', observedDurationDays: 0 })).toEqual([]);
  });

  it('rejects videos (metadata is not stripped) but allows photos', () => {
    const photo = { id: 'p', uri: 'file:///p.jpg', type: 'photo' as const };
    const video = { id: 'v', uri: 'file:///v.mp4', type: 'video' as const };
    expect(validateInsider({ insiderCategory: 'it' }, [photo])).toEqual([]);
    expect(validateInsider({ insiderCategory: 'it' }, [photo, video])).toHaveLength(1);
  });
});

describe('validateCommercial', () => {
  it('passes a complete context', () => {
    expect(validateCommercial(makeCommercialContext())).toEqual([]);
  });

  it('requires name, address and both attestations', () => {
    expect(validateCommercial({})).toHaveLength(4);
    expect(validateCommercial(makeCommercialContext({ businessName: '  ' }))).toHaveLength(1);
    expect(validateCommercial(makeCommercialContext({ businessAddressFull: '' }))).toHaveLength(1);
    expect(validateCommercial(makeCommercialContext({ publicViewConfirmed: false }))).toHaveLength(1);
    expect(validateCommercial(makeCommercialContext({ reporterAttestation: false }))).toHaveLength(1);
  });
});

describe('validateCorridor', () => {
  it('passes a complete corridor', () => {
    expect(validateCorridor(makeCorridorGeometry())).toEqual([]);
  });

  it('requires street, start and end', () => {
    expect(validateCorridor({})).toHaveLength(3);
    expect(validateCorridor(makeCorridorGeometry({ streetName: ' ' }))).toHaveLength(1);
  });

  it('rejects start and end at the same spot', () => {
    const p = { latitude: 42.3601, longitude: -71.0589 };
    expect(validateCorridor({ streetName: 'Beacon', start: p, end: { ...p } })).toHaveLength(1);
    // ~5 m apart: still GPS noise
    expect(validateCorridor({ streetName: 'Beacon', start: p, end: { latitude: 42.36014, longitude: -71.0589 } })).toHaveLength(1);
  });

  it('distanceMeters is roughly right', () => {
    // 0.001 deg latitude ~ 111 m
    const d = distanceMeters({ latitude: 42, longitude: -71 }, { latitude: 42.001, longitude: -71 });
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });
});
