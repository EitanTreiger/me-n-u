import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { supabase } from './supabase';

// On web, closes the popup/tab that a native-style auth session opened.
WebBrowser.maybeCompleteAuthSession();

/**
 * Where Google (via Supabase) sends the user back to. This must be listed in
 * Supabase -> Authentication -> URL Configuration -> Redirect URLs.
 *   Expo Go:       exp://<your-ip>:8081/--/auth-callback
 *   Built app:     me-n-u://auth-callback
 */
export const oauthRedirect = Linking.createURL('auth-callback');

export type OAuthResult = 'signed-in' | 'cancelled' | 'redirecting';

export async function signInWithGoogle(): Promise<OAuthResult> {
  if (Platform.OS === 'web') {
    // Full-page redirect; supabase-js picks up the ?code= when we come back.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin, queryParams: { prompt: 'select_account' } },
    });
    if (error) throw error;
    return 'redirecting';
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: oauthRedirect, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  });
  if (error) throw error;

  const result = await WebBrowser.openAuthSessionAsync(data.url, oauthRedirect);
  if (result.type !== 'success') return 'cancelled';
  await completeOAuth(result.url);
  return 'signed-in';
}

/** Exchange the one-time ?code= from the redirect URL for a session. */
export async function completeOAuth(url: string) {
  const { queryParams } = Linking.parse(url);
  if (queryParams?.error_description) throw new Error(String(queryParams.error_description));
  const code = queryParams?.code;
  if (typeof code !== 'string') throw new Error("Google sign-in didn't finish. Please try again.");
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw error;
}
