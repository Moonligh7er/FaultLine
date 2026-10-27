import { submitReport, createReport } from '../reports';
import { uploadAllMedia } from '../media';
import { supabase } from '../supabase';
import {
  makeReportInput,
  makeDigitalContext,
  makeInsiderContext,
  makeCommercialContext,
  makeCorridorGeometry,
} from './fixtures';
import type { MediaAttachment } from '../../types';

jest.mock('../supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('../media', () => ({ uploadAllMedia: jest.fn() }));

const UUID_V4_LOWER = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const mockFrom = supabase.from as jest.Mock;
const mockUpload = uploadAllMedia as jest.MockedFunction<typeof uploadAllMedia>;

let insert: jest.Mock;
let single: jest.Mock;
const calls: string[] = [];

function setupInsert(result: { data: any; error: any }) {
  single = jest.fn().mockResolvedValue(result);
  const select = jest.fn(() => ({ single }));
  insert = jest.fn((row: any) => {
    calls.push('insert');
    return { select };
  });
  mockFrom.mockImplementation(() => ({ insert }));
}

// Echo the inserted row back like `.select().single()` would.
function setupEchoInsert() {
  setupInsert({ data: null, error: null });
  single.mockImplementation(async () => ({
    data: { ...insert.mock.calls[0][0], created_at: 'now', updated_at: 'now' },
    error: null,
  }));
}

const photo = (id: string): MediaAttachment => ({ id, uri: `file:///${id}.jpg`, type: 'photo' });

beforeEach(() => {
  jest.clearAllMocks();
  calls.length = 0;
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore();
});

describe('submitReport', () => {
  it('inserts a lowercase v4 UUID id', async () => {
    setupEchoInsert();
    const result = await submitReport(makeReportInput());
    const row = insert.mock.calls[0][0];
    expect(row.id).toMatch(UUID_V4_LOWER);
    expect(result?.id).toBe(row.id);
  });

  it('falls back to a lowercase v4 UUID when crypto.randomUUID is unavailable', async () => {
    const original = (globalThis as any).crypto;
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
    try {
      setupEchoInsert();
      for (let i = 0; i < 20; i++) {
        insert.mockClear();
        await submitReport(makeReportInput());
        expect(insert.mock.calls[0][0].id).toMatch(UUID_V4_LOWER);
      }
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true, writable: true });
    }
  });

  it('skips upload when there is no media', async () => {
    setupEchoInsert();
    await submitReport(makeReportInput({ media: [] }));
    expect(mockUpload).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('uploads media under the report id before inserting, and inserts the uploaded media', async () => {
    setupEchoInsert();
    const local = [photo('a'), photo('b')];
    const uploaded = local.map((m) => ({ ...m, uploadedUrl: `https://cdn/${m.id}` }));
    mockUpload.mockImplementation(async () => {
      calls.push('upload');
      return uploaded;
    });
    const onProgress = jest.fn();

    const result = await submitReport(makeReportInput({ media: local }), onProgress);

    expect(calls).toEqual(['upload', 'insert']);
    const row = insert.mock.calls[0][0];
    expect(mockUpload).toHaveBeenCalledWith(local, row.id, onProgress);
    expect(row.media).toEqual(uploaded);
    expect(result?.media).toEqual(uploaded);
  });

  it('returns null and does not insert when upload fails', async () => {
    setupEchoInsert();
    mockUpload.mockRejectedValue(new Error('storage 403'));
    const result = await submitReport(makeReportInput({ media: [photo('a')] }));
    expect(result).toBeNull();
    expect(insert).not.toHaveBeenCalled();
  });

  it('returns null when the insert errors', async () => {
    setupInsert({ data: null, error: { message: 'rls' } });
    expect(await submitReport(makeReportInput())).toBeNull();
  });
});

describe('createReport', () => {
  it('forces is_anonymous=true when there is no userId', async () => {
    setupEchoInsert();
    await createReport(makeReportInput({ userId: undefined, isAnonymous: false }));
    expect(insert.mock.calls[0][0].is_anonymous).toBe(true);
    expect(insert.mock.calls[0][0].user_id).toBeUndefined();
  });

  it('keeps is_anonymous=false for a signed-in non-anonymous user', async () => {
    setupEchoInsert();
    await createReport(makeReportInput({ userId: 'u1', isAnonymous: false }));
    expect(insert.mock.calls[0][0].is_anonymous).toBe(false);
  });

  it('honours isAnonymous=true for a signed-in user', async () => {
    setupEchoInsert();
    await createReport(makeReportInput({ userId: 'u1', isAnonymous: true }));
    expect(insert.mock.calls[0][0].is_anonymous).toBe(true);
  });

  it('omits id when none is supplied and maps location/severity columns', async () => {
    setupEchoInsert();
    await createReport(makeReportInput());
    const row = insert.mock.calls[0][0];
    expect(mockFrom).toHaveBeenCalledWith('reports');
    expect('id' in row).toBe(false);
    expect(row).toMatchObject({
      latitude: 42.3601,
      longitude: -71.0589,
      state: 'MA',
      hazard_level: 'dangerous',
      size_rating: null,
      urgency: null,
      condition_level: null,
    });
  });

  it('maps the returned row back to a Report', async () => {
    setupInsert({
      data: {
        id: 'r1', user_id: 'u1', category: 'pothole', latitude: 1, longitude: 2,
        hazard_level: null, media: null, upvote_count: null, is_quick_report: null,
      },
      error: null,
    });
    const r = await createReport(makeReportInput());
    expect(r).toMatchObject({
      id: 'r1',
      location: { latitude: 1, longitude: 2 },
      severity: { hazardLevel: 'moderate' },
      media: [],
      upvoteCount: 0,
      confirmCount: 0,
      isQuickReport: false,
    });
  });
});

describe('createReport — extended report types', () => {
  const BASE_COLUMNS = [
    'user_id', 'category', 'latitude', 'longitude', 'address', 'city', 'state', 'zip',
    'description', 'size_rating', 'hazard_level', 'urgency', 'condition_level', 'media',
    'vehicle_damage', 'status', 'authority_id', 'cluster_id', 'submission_method',
    'is_anonymous', 'sensor_detected', 'offline_queued', 'is_quick_report',
  ];

  it('sends exactly the original columns for an ordinary report', async () => {
    setupEchoInsert();
    await createReport(makeReportInput());
    expect(Object.keys(insert.mock.calls[0][0]).sort()).toEqual([...BASE_COLUMNS].sort());
  });

  it('persists digital context to digital_* columns', async () => {
    setupEchoInsert();
    const r = await createReport(makeReportInput({ category: 'broken_city_website_form', digital: makeDigitalContext() }));
    expect(insert.mock.calls[0][0]).toMatchObject({
      digital_target_url: 'https://www.boston.gov/permits/apply',
      digital_assistive_tech: 'NVDA',
      digital_browser: 'Firefox',
      digital_platform: 'Windows',
      digital_wcag_criterion: '4.1.2',
      digital_snapshot_ref: 'snap/abc',
    });
    expect(r?.digital).toEqual(makeDigitalContext());
  });

  it('persists insider context as insider_context JSON and keeps it on the returned Report only', async () => {
    setupEchoInsert();
    const insider = makeInsiderContext();
    const r = await createReport(makeReportInput({ insider }));
    const row = insert.mock.calls[0][0];
    expect(row.insider_context).toEqual({
      insider_category: 'public_works',
      observed_duration_days: 540,
      prior_internal_report_ref: 'Internal ticket 2024-03-15',
      documentary_reference: 'Work order #12345',
    });
    expect(Object.keys(row).some((k) => k.startsWith('insider_') && k !== 'insider_context')).toBe(false);
    expect(r?.insider).toEqual(insider);
  });

  it('persists a corridor as geometry_type + EWKT and returns the input corridor', async () => {
    setupEchoInsert();
    const corridor = makeCorridorGeometry();
    const r = await createReport(makeReportInput({ geometryType: 'corridor', corridor }));
    expect(insert.mock.calls[0][0]).toMatchObject({
      geometry_type: 'corridor',
      corridor_geometry: 'SRID=4326;LINESTRING(-71.0589 42.3601,-71.0612 42.3622)',
      corridor_street_name: 'Beacon Street',
      corridor_from_cross_street: 'Park St',
      corridor_to_cross_street: 'Charles St',
    });
    expect(r?.geometryType).toBe('corridor');
    expect(r?.corridor).toEqual(corridor);
  });

  describe('commercial property', () => {
    let selectSpy: jest.Mock;
    function setupMinimalInsert(error: any = null) {
      selectSpy = jest.fn();
      insert = jest.fn(() => Object.assign(Promise.resolve({ data: null, error }), { select: selectSpy }));
      mockFrom.mockImplementation(() => ({ insert }));
    }

    it('persists commercial columns and skips RETURNING (anonymous submitters cannot read the row back)', async () => {
      setupMinimalInsert();
      const commercial = makeCommercialContext({ chainIdentifier: 'CVS' });
      const r = await createReport(
        makeReportInput({ userId: undefined, isAnonymous: false, reportSubject: 'commercial_property', commercial }),
      );
      const row = insert.mock.calls[0][0];
      expect(selectSpy).not.toHaveBeenCalled();
      expect(row).toMatchObject({
        report_subject: 'commercial_property',
        commercial_business_name: 'Riverdale Retail Center',
        commercial_business_address: '123 Main St, Springfield, MA 01103',
        commercial_chain_identifier: 'cvs',
        commercial_public_view_confirmed: true,
        commercial_reporter_attestation: true,
        is_anonymous: true,
      });
      expect(row.id).toMatch(UUID_V4_LOWER);
      expect(r).toMatchObject({
        id: row.id,
        reportSubject: 'commercial_property',
        commercial,
        isAnonymous: true,
        upvoteCount: 0,
        confirmCount: 0,
      });
    });

    it('uses the id passed by submitReport', async () => {
      setupMinimalInsert();
      const r = await createReport(
        makeReportInput({ reportSubject: 'commercial_property', commercial: makeCommercialContext() }),
        'fixed-id',
      );
      expect(insert.mock.calls[0][0].id).toBe('fixed-id');
      expect(r?.id).toBe('fixed-id');
    });

    it('returns null when the insert errors', async () => {
      setupMinimalInsert({ message: 'check violation' });
      const r = await createReport(
        makeReportInput({ reportSubject: 'commercial_property', commercial: makeCommercialContext() }),
      );
      expect(r).toBeNull();
    });
  });
});
