import {
  completeAuthFromUrl,
  requestMagicLink,
  clearPendingSignIn,
  AUTH_CALLBACK_URL,
  PENDING_SIGNIN_TTL_MS,
} from '../authLinking';
import { supabase } from '../supabase';

jest.mock('expo-linking', () => ({
  createURL: jest.fn((path: string) => `faultline://${path}`),
  getInitialURL: jest.fn(),
  addEventListener: jest.fn(),
}));
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => { store.set(k, v); }),
    deleteItemAsync: jest.fn(async (k: string) => { store.delete(k); }),
  };
});
jest.mock('../supabase', () => ({
  supabase: {
    auth: {
      exchangeCodeForSession: jest.fn(),
      setSession: jest.fn(),
      signInWithOtp: jest.fn(),
    },
  },
}));

const mockExchange = supabase.auth.exchangeCodeForSession as jest.Mock;
const mockSetSession = supabase.auth.setSession as jest.Mock;
const mockOtp = supabase.auth.signInWithOtp as jest.Mock;

beforeEach(async () => {
  jest.clearAllMocks();
  await clearPendingSignIn();
  mockExchange.mockResolvedValue({ error: null });
  mockSetSession.mockResolvedValue({ error: null });
  mockOtp.mockResolvedValue({ error: null });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  await requestMagicLink('me@example.com');
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

  it('requests the magic link with the callback redirect', () => {
    expect(mockOtp).toHaveBeenCalledWith({
      email: 'me@example.com',
      options: { emailRedirectTo: 'faultline://auth/callback' },
    });
  });

  it('never trusts #access_token / #refresh_token (implicit flow)', async () => {
    await completeAuthFromUrl('faultline://auth/callback#access_token=AT&refresh_token=RT&type=magiclink');
    expect(mockSetSession).not.toHaveBeenCalled();
    expect(mockExchange).not.toHaveBeenCalled();
  });

  it('ignores a code when no sign-in is pending on this device', async () => {
    await clearPendingSignIn();
    await completeAuthFromUrl('faultline://auth/callback?code=planted');
    expect(mockExchange).not.toHaveBeenCalled();
  });

  it('ignores a code after the 15-minute window', async () => {
    const now = Date.now();
    const spy = jest.spyOn(Date, 'now').mockReturnValue(now + PENDING_SIGNIN_TTL_MS + 1);
    try {
      await completeAuthFromUrl('faultline://auth/callback?code=late');
      expect(mockExchange).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('clears the pending flag after a successful exchange (a second link is ignored)', async () => {
    await completeAuthFromUrl('faultline://auth/callback?code=first');
    await completeAuthFromUrl('faultline://auth/callback?code=second');
    expect(mockExchange).toHaveBeenCalledTimes(1);
    expect(mockExchange).toHaveBeenCalledWith('first');
  });

  it('clears the pending flag when the link request fails', async () => {
    await clearPendingSignIn();
    mockOtp.mockResolvedValue({ error: { message: 'rate limited' } });
    const { error } = await requestMagicLink('me@example.com');
    expect(error?.message).toBe('rate limited');
    await completeAuthFromUrl('faultline://auth/callback?code=abc');
    expect(mockExchange).not.toHaveBeenCalled();
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
