import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

// Set in mobile/.env.local for local runs and in Vercel's Environment
// Variables for the website, so they aren't stored in the repo. The
// publishable (anon) key still ends up in the built app (every Supabase web
// app needs it in the browser); row level security decides what each
// signed-in user can read and write.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = Boolean(url && anonKey);

// Placeholders keep the app from crashing when the values are missing; the
// sign-in screen then says Supabase isn't configured.
export const supabase = createClient(url || 'https://not-configured.supabase.co', anonKey || 'not-configured', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // PKCE: OAuth redirects come back with a one-time ?code= we exchange for a session.
    flowType: 'pkce',
    // On web the redirect lands on the page itself, so let supabase-js pick it up.
    detectSessionInUrl: Platform.OS === 'web',
  },
});

// Keep the session fresh only while the app is in the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

export const PHOTO_BUCKET = 'recipe-photos';

export function photoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  // A full web address (e.g. a Wikimedia Commons photo) is used as-is.
  if (/^https?:\/\//.test(path)) return path;
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

export const AVATAR_BUCKET = 'avatars';

export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Turn a Supabase/Postgres error into a sentence a person can act on. */
export function friendlyError(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return (e as { message: string }).message;
  }
  return 'Something went wrong. Please try again.';
}
