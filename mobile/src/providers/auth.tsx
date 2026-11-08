import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase';

type AuthState = {
  session: Session | null;
  loading: boolean;
  displayName: string;
  /** Storage path of the picture the user uploaded, if any. */
  avatarPath: string | null;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

type Profile = { displayName: string; avatarPath: string | null };

async function fetchProfile(userId: string | undefined): Promise<Profile> {
  if (!userId) return { displayName: '', avatarPath: null };
  const { data, error } = await supabase.from('profiles').select('display_name, avatar_path').eq('id', userId).maybeSingle();
  if (!error) return { displayName: data?.display_name ?? '', avatarPath: data?.avatar_path ?? null };
  // Before the profile-avatars migration has run there is no avatar_path column.
  const { data: nameOnly } = await supabase.from('profiles').select('display_name').eq('id', userId).maybeSingle();
  return { displayName: nameOnly?.display_name ?? '', avatarPath: null };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile>({ displayName: '', avatarPath: null });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;

  const refreshProfile = async () => {
    setProfile(await fetchProfile(userId));
  };

  useEffect(() => {
    let alive = true;
    fetchProfile(userId).then((p) => {
      if (alive) setProfile(p);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        displayName: profile.displayName,
        avatarPath: profile.avatarPath,
        refreshProfile,
        signOut: async () => {
          await supabase.auth.signOut();
        },
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
