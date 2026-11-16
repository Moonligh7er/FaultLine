import { scrubString, scrubEvent, scrubBreadcrumb } from '../crashReporting';

jest.mock('@sentry/react-native', () => ({ init: jest.fn(), setUser: jest.fn(), setContext: jest.fn(), captureException: jest.fn() }));

const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';

describe('scrubString', () => {
  it('drops query strings from URLs, including deep links', () => {
    expect(scrubString('GET https://x.supabase.co/rest/v1/reports?select=id&lat=42.1 failed'))
      .toBe('GET https://x.supabase.co/rest/v1/reports?[Filtered] failed');
    expect(scrubString('faultline://auth/callback?code=abc123')).toBe('faultline://auth/callback?[Filtered]');
  });

  it('removes JWTs and bearer tokens', () => {
    expect(scrubString(`token ${JWT}`)).not.toContain('eyJ');
    expect(scrubString('Authorization: Bearer abc.def-ghi')).toBe('Authorization: Bearer [Filtered]');
    expect(scrubString('refresh_token=xyz&x=1')).toBe('refresh_token=[Filtered]&x=1');
  });

  it('removes the row values from "Failing row contains" errors', () => {
    const msg = 'new row violates check constraint "x"\nFailing row contains (1, secret desc, 42.36, -71.05).';
    expect(scrubString(msg)).toBe('new row violates check constraint "x"\nFailing row contains [Filtered]');
  });
});

describe('scrubEvent / scrubBreadcrumb', () => {
  it('scrubs messages, exceptions, request data and user PII', () => {
    const event: any = scrubEvent({
      message: 'Failing row contains (a, b)',
      exception: { values: [{ value: `bad ${JWT}`, stacktrace: { frames: [{ filename: 'app:///index.bundle?platform=ios' }] } }] },
      request: { url: 'https://h/p?code=1', query_string: 'code=1', headers: { Authorization: 'Bearer x' }, cookies: 'c' },
      user: { id: 'u1', email: 'a@b.c', ip_address: '1.2.3.4' },
      extra: { access_token: 'abc', nested: { url: 'https://h/p?apikey=1' } },
    } as any);
    expect(event.message).toBe('Failing row contains [Filtered]');
    expect(event.exception.values[0].value).not.toContain('eyJ');
    // Stack frames are left alone (source-map resolution)
    expect(event.exception.values[0].stacktrace.frames[0].filename).toBe('app:///index.bundle?platform=ios');
    expect(event.request.url).toBe('https://h/p?[Filtered]');
    expect(event.request.query_string).toBeUndefined();
    expect(event.request.headers).toEqual({});
    expect(event.user).toEqual({ id: 'u1' });
    expect(event.extra.access_token).toBe('[Filtered]');
    expect(event.extra.nested.url).toBe('https://h/p?[Filtered]');
  });

  it('scrubs breadcrumb URLs', () => {
    const b = scrubBreadcrumb({ category: 'fetch', data: { url: 'https://h/rest/v1/profiles?id=eq.123', method: 'GET' } });
    expect(b?.data?.url).toBe('https://h/rest/v1/profiles?[Filtered]');
  });
});
