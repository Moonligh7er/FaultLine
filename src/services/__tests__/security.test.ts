import { assertRequestAllowed, isAllowedHost, createPinnedFetch } from '../security';

jest.mock('expo-constants', () => ({
  expoConfig: {
    extra: {
      supabaseUrl: 'https://dzewklljiksyivsfpunt.supabase.co',
      kokoroTtsUrl: 'https://moons7onr--kokoro-tts-server-kokorotts-tts.modal.run',
      kokoroHealthUrl: 'https://moons7onr--kokoro-tts-server-kokorotts-health.modal.run',
      sentryDsn: 'https://abc@o123.ingest.us.sentry.io/456',
    },
  },
}));

beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => {}));
afterEach(() => (console.warn as jest.Mock).mockRestore());

describe('isAllowedHost', () => {
  it.each([
    'dzewklljiksyivsfpunt.supabase.co',
    'exp.host',
    'formspree.io',
    'geocoding.geo.census.gov',
    '311.boston.gov',
    'seeclickfix.com',
    'api.seeclickfix.com',
    'moons7onr--kokoro-tts-server-kokorotts-tts.modal.run',
    'moons7onr--kokoro-tts-server-kokorotts-health.modal.run',
    'o123.ingest.us.sentry.io',
  ])('allows %s', (host) => expect(isAllowedHost(host)).toBe(true));

  it.each([
    'evilsupabase.co',
    'attacker.supabase.co', // other Supabase projects
    'supabase.co',
    'evil-seeclickfix.com', // suffix without a dot boundary
    'seeclickfix.com.evil.net',
    'attacker.modal.run', // only our Modal endpoints
    'modal.run',
    'api.anthropic.com', // server-side only
    '',
  ])('blocks %s', (host) => expect(isAllowedHost(host)).toBe(false));
});

describe('assertRequestAllowed', () => {
  it('fails closed on unparseable / relative URLs', () => {
    expect(() => assertRequestAllowed('/relative/path')).toThrow(/blocked/);
    expect(() => assertRequestAllowed('not a url')).toThrow(/blocked/);
  });

  it('rejects plain http to allowed hosts', () => {
    expect(() => assertRequestAllowed('http://formspree.io/f/x')).toThrow(/HTTPS/);
  });

  it('allows local file reads', () => {
    expect(() => assertRequestAllowed('file:///data/user/0/cache/photo.jpg')).not.toThrow();
  });

  it('wraps fetch and only forwards allowed requests', async () => {
    const original = jest.fn().mockResolvedValue({ ok: true });
    const pinned = createPinnedFetch(original as any);
    await pinned('https://formspree.io/f/abc');
    expect(original).toHaveBeenCalledTimes(1);
    await expect(pinned('https://evil.example/steal')).rejects.toThrow(/blocked/);
    expect(original).toHaveBeenCalledTimes(1);
  });
});
