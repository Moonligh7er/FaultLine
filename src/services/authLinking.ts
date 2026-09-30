import * as Linking from 'expo-linking';
import { supabase } from './supabase';

// Magic-link redirect target. Resolves to faultline://auth/callback in
// standalone/dev builds and exp://<host>/--/auth/callback in Expo Go.
// Both must be in Supabase Auth → URL Configuration → Redirect URLs.
export const AUTH_CALLBACK_URL = Linking.createURL('auth/callback');

// Completes a magic-link sign-in from the redirect URL. Handles the PKCE
// `?code=` form (our client default) and the implicit `#access_token=` form
// in case the project's email template still emits it.
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
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) console.warn('[auth] code exchange failed:', error.message);
    return;
  }

  const accessToken = fragment.get('access_token');
  const refreshToken = fragment.get('refresh_token');
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (error) console.warn('[auth] setSession failed:', error.message);
  }
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
