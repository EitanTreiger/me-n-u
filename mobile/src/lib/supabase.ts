import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

// The publishable (anon) key is designed to ship inside the app: row level
// security decides what each signed-in user can read and write.
// Override either value with mobile/.env.local if you point at another project.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://pmldwxwvowvkjxumgmfy.supabase.co';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_eNcVJbRIWELa48nNjdH_0Q_ElOQ-9aW';

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient(url, anonKey, {
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
