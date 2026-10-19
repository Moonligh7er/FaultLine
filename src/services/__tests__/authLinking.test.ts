import { completeAuthFromUrl, AUTH_CALLBACK_URL } from '../authLinking';
import { supabase } from '../supabase';

jest.mock('expo-linking', () => ({
  createURL: jest.fn((path: string) => `faultline://${path}`),
  getInitialURL: jest.fn(),
  addEventListener: jest.fn(),
}));
jest.mock('../supabase', () => ({
  supabase: {
    auth: {
      exchangeCodeForSession: jest.fn(),
      setSession: jest.fn(),
    },
  },
}));

const mockExchange = supabase.auth.exchangeCodeForSession as jest.Mock;
const mockSetSession = supabase.auth.setSession as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockExchange.mockResolvedValue({ error: null });
  mockSetSession.mockResolvedValue({ error: null });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => (console.warn as jest.Mock).mockRestore());

describe('completeAuthFromUrl', () => {
  it('builds the callback URL via expo-linking', () => {
    expect(AUTH_CALLBACK_URL).toBe('faultline://auth/callback');
  });

  it('exchanges a PKCE ?code= for a session', async () => {
    await completeAuthFromUrl('faultline://auth/callback?code=abc123');
    expect(mockExchange).toHaveBeenCalledWith('abc123');
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it('works with the Expo Go exp:// form', async () => {
    await completeAuthFromUrl('exp://192.168.1.5:8081/--/auth/callback?code=xyz');
    expect(mockExchange).toHaveBeenCalledWith('xyz');
  });

  it('sets the session from #access_token / #refresh_token', async () => {
    await completeAuthFromUrl('faultline://auth/callback#access_token=AT&refresh_token=RT&type=magiclink');
    expect(mockSetSession).toHaveBeenCalledWith({ access_token: 'AT', refresh_token: 'RT' });
    expect(mockExchange).not.toHaveBeenCalled();
  });

  it('does nothing with only an access token (no refresh token)', async () => {
    await completeAuthFromUrl('faultline://auth/callback#access_token=AT');
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it.each([
    'faultline://auth/callback?error=access_denied&error_description=Email+link+is+invalid',
    'faultline://auth/callback#error=access_denied&error_description=expired',
    'faultline://auth/callback?code=abc&error_description=bad',
  ])('bails on error_description (%s)', async (url) => {
    await completeAuthFromUrl(url);
    expect(mockExchange).not.toHaveBeenCalled();
    expect(mockSetSession).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
  });

  it.each([
    'faultline://report/123?code=abc',
    'https://faultline.example/reset#access_token=AT&refresh_token=RT',
    'faultline://',
  ])('ignores non-callback URLs (%s)', async (url) => {
    await completeAuthFromUrl(url);
    expect(mockExchange).not.toHaveBeenCalled();
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it('does not throw when the exchange returns an error', async () => {
    mockExchange.mockResolvedValue({ error: { message: 'expired' } });
    await expect(completeAuthFromUrl('faultline://auth/callback?code=old')).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalled();
  });
});
