import { submitToAuthority, syncReportStatus } from '../authorityApi';
import { supabase } from '../supabase';
import { makeReport } from './fixtures';
import type { Authority } from '../../types';

jest.mock('../supabase', () => ({ supabase: { functions: { invoke: jest.fn() } } }));

const mockInvoke = supabase.functions.invoke as jest.Mock;

const authority: Authority = {
  id: 'auth-42',
  name: 'Boston Public Works',
  level: 'city',
  state: 'MA',
  city: 'Boston',
  submissionMethods: [],
  isActive: true,
};

beforeEach(() => jest.clearAllMocks());

describe('submitToAuthority', () => {
  it("invokes 'send-report-email' with { reportId, authorityId }", async () => {
    mockInvoke.mockResolvedValue({ data: { ref: 'Q-1' }, error: null });
    await submitToAuthority(makeReport({ id: 'rep-7' }), authority);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith('send-report-email', {
      body: { reportId: 'rep-7', authorityId: 'auth-42' },
    });
  });

  it('maps success to { success, externalId, method: queue }', async () => {
    mockInvoke.mockResolvedValue({ data: { ref: 'Q-1' }, error: null });
    expect(await submitToAuthority(makeReport(), authority)).toEqual({
      success: true,
      externalId: 'Q-1',
      method: 'queue',
    });
  });

  it('maps a function error to success=false with its message', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'rate limited' } });
    expect(await submitToAuthority(makeReport(), authority)).toEqual({
      success: false,
      method: 'queue',
      error: 'rate limited',
    });
  });

  it('maps a thrown error to success=false', async () => {
    mockInvoke.mockRejectedValue(new Error('offline'));
    const res = await submitToAuthority(makeReport(), authority);
    expect(res.success).toBe(false);
    expect(res.error).toContain('offline');
  });
});

describe('syncReportStatus', () => {
  it('returns null for unknown methods without fetching', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch' as any);
    expect(await syncReportStatus('x', 'email', 'https://example.invalid')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('maps an Open311 closed status to resolved (mocked fetch)', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
      ok: true,
      json: async () => [{ status: 'closed', updated_datetime: '2026-01-01', status_notes: 'patched' }],
    } as any);
    const res = await syncReportStatus('123', 'open311', 'https://311.example.invalid/requests.json');
    expect(fetchSpy).toHaveBeenCalledWith('https://311.example.invalid/requests/123.json');
    expect(res).toEqual({ externalId: '123', status: 'resolved', lastUpdated: '2026-01-01', notes: 'patched' });
    fetchSpy.mockRestore();
  });
});
