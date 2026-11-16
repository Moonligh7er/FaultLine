import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import { supabase } from './supabase';

// Magic-link redirect target. Resolves to faultline://auth/callback in
// standalone/dev builds and exp://<host>/--/auth/callback in Expo Go.
// Both must be in Supabase Auth → URL Configuration → Redirect URLs.
export const AUTH_CALLBACK_URL = Linking.createURL('auth/callback');

// A callback link is only honoured while a sign-in this device started is
// pending: set when the magic link is requested, good for 15 minutes,
// cleared once the code is exchanged. Any other faultline://auth/callback
// link (e.g. one planted by another app or web page) is ignored.
const PENDING_KEY = 'fl_pending_signin';
export const PENDING_SIGNIN_TTL_MS = 15 * 60 * 1000;
let memoryPendingUntil = 0; // fallback where SecureStore is unavailable (web)

async function setPendingSignIn(): Promise<void> {
  const until = Date.now() + PENDING_SIGNIN_TTL_MS;
  memoryPendingUntil = until;
  try {
    await SecureStore.setItemAsync(PENDING_KEY, String(until));
  } catch {}
}

async function hasPendingSignIn(): Promise<boolean> {
  let until = memoryPendingUntil;
  try {
    const stored = await SecureStore.getItemAsync(PENDING_KEY);
    if (stored) until = Math.max(until, Number(stored) || 0);
  } catch {}
  return until > Date.now();
}

export async function clearPendingSignIn(): Promise<void> {
  memoryPendingUntil = 0;
  try {
    await SecureStore.deleteItemAsync(PENDING_KEY);
  } catch {}
}

// Requests a magic link (PKCE) and marks the sign-in as pending.
export async function requestMagicLink(email: string): Promise<{ error: { message: string } | null }> {
  await setPendingSignIn();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: AUTH_CALLBACK_URL },
  });
  if (error) await clearPendingSignIn();
  return { error };
}

// Completes a magic-link sign-in from the redirect URL. Only the PKCE
// `?code=` form is accepted; tokens in a URL fragment are never trusted.
export async function completeAuthFromUrl(url: string): Promise<void> {
  if (!url.includes('auth/callback')) return;

  const [beforeHash, hash = ''] = url.split('#');
  const query = new URLSearchParams(beforeHash.split('?')[1] ?? '');
  const fragment = new URLSearchParams(hash);

  const errorDescription = query.get('error_description') || fragment.get('error_description');
  if (errorDescription) {
    console.warn('[auth] magic link error:', errorDescription);
    return;
  }

  const code = query.get('code');
  if (!code) return;

  if (!(await hasPendingSignIn())) {
    console.warn('[auth] ignoring sign-in link: no sign-in was started on this device in the last 15 minutes');
    return;
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.warn('[auth] code exchange failed:', error.message);
    return;
  }
  await clearPendingSignIn();
}

// Handles both cold starts (app opened by the link) and warm links.
export function listenForAuthLinks(): () => void {
  Linking.getInitialURL()
    .then((url) => (url ? completeAuthFromUrl(url) : undefined))
    .catch((err) => console.warn('[auth] initial URL:', err?.message || err));
  const sub = Linking.addEventListener('url', ({ url }) => {
    completeAuthFromUrl(url).catch((err) => console.warn('[auth] link:', err?.message || err));
  });
  return () => sub.remove();
}
