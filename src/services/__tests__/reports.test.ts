import { submitReport, createReport } from '../reports';
import { uploadAllMedia } from '../media';
import { supabase } from '../supabase';
import { makeReportInput } from './fixtures';
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
