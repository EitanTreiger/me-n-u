import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase';
import type { Home, Role } from '@/lib/types';

import { useAuth } from './auth';

const ACTIVE_HOME_KEY = 'activeHomeId';
// A home code from a join link, kept until the person has signed in.
const PENDING_JOIN_KEY = 'pendingJoinCode';

/** Remember a join link's code so it's used as soon as the person is signed in. */
export function rememberJoinCode(code: string) {
  return AsyncStorage.setItem(PENDING_JOIN_KEY, code.trim().toUpperCase()).catch(() => {});
}

type GroupsState = {
  /** Every home the user belongs to, with their role in each. */
  homes: Home[];
  /** The home being viewed: its menu, groceries and pantry are shown. */
  activeHome: Home | null;
  /** Admin of the home being viewed (admin rights never carry over to other homes). */
  isAdmin: boolean;
  loading: boolean;
  setActiveHome: (homeId: string) => void;
  refresh: () => Promise<void>;
  /** Create a home; the creator becomes its admin (the only way to be one). */
  createHome: (name: string) => Promise<string>;
  /** Join a home as a member with its code (join links). */
  joinHome: (code: string) => Promise<string>;
  /** Join a home picked from the list, as a member. */
  joinHomeById: (homeId: string) => Promise<string>;
  leaveHome: (homeId: string) => Promise<void>;
};

const GroupsContext = createContext<GroupsState | null>(null);

async function fetchHomes(userId: string | undefined): Promise<{ rows: Home[]; stored: string | null } | null> {
  if (!userId) return { rows: [], stored: null };
  const { data, error } = await supabase
    .from('home_members')
    .select('role, homes(id, name, invite_code, created_at)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: true });
  if (error || !data) return null;
  const rows = (data as unknown as { role: Role; homes: Omit<Home, 'role'> | null }[])
    .filter((r) => r.homes)
    .map((r) => ({ ...r.homes!, role: r.role }));
  const stored = await AsyncStorage.getItem(ACTIVE_HOME_KEY).catch(() => null);
  return { rows, stored };
}

export function GroupsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [homes, setHomes] = useState<Home[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Which signed-in user the homes were loaded for, so a fresh sign-in
  // counts as "loading" until their homes arrive.
  const [loadedFor, setLoadedFor] = useState<string | undefined | null>(null);

  // Keep the chosen home, else the one saved on this device, else the first.
  const apply = useCallback((result: { rows: Home[]; stored: string | null } | null) => {
    if (result) {
      setHomes(result.rows);
      setActiveId((current) => {
        for (const candidate of [current, result.stored]) if (result.rows.some((h) => h.id === candidate)) return candidate;
        return result.rows[0]?.id ?? null;
      });
    }
    setLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    apply(await fetchHomes(userId));
  }, [userId, apply]);

  useEffect(() => {
    let alive = true;
    fetchHomes(userId).then((result) => {
      if (!alive) return;
      apply(result);
      setLoadedFor(userId);
    });
    return () => {
      alive = false;
    };
  }, [userId, apply]);

  const setActiveHome = useCallback((homeId: string) => {
    setActiveId(homeId);
    AsyncStorage.setItem(ACTIVE_HOME_KEY, homeId).catch(() => {});
  }, []);

  const joinHome = useCallback(
    async (code: string) => {
      const { data: homeId, error } = await supabase.rpc('join_home', { code: code.trim().toUpperCase() });
      if (error) throw error;
      await refresh();
      setActiveHome(homeId as string);
      return homeId as string;
    },
    [refresh, setActiveHome],
  );

  // Opened a join link before signing in: join once signed in.
  useEffect(() => {
    if (!userId || loadedFor !== userId) return;
    AsyncStorage.getItem(PENDING_JOIN_KEY)
      .then(async (code) => {
        if (!code) return;
        await AsyncStorage.removeItem(PENDING_JOIN_KEY);
        await joinHome(code);
      })
      .catch(() => {});
  }, [userId, loadedFor, joinHome]);

  const value = useMemo<GroupsState>(() => {
    const activeHome = homes.find((h) => h.id === activeId) ?? null;
    return {
      homes,
      activeHome,
      isAdmin: activeHome?.role === 'admin',
      loading: loading || loadedFor !== userId,
      setActiveHome,
      refresh,
      createHome: async (name) => {
        // Every home needs a name: it's how people tell their homes apart.
        const trimmed = name.trim();
        if (trimmed.length < 2) throw new Error('Give your home a name first (e.g. "Maple Street Home").');
        if (trimmed.length > 80) throw new Error('Keep the home name under 80 characters.');
        const { data: homeId, error } = await supabase.rpc('create_home', { home_name: trimmed });
        if (error) throw error;
        await refresh();
        setActiveHome(homeId as string);
        return homeId as string;
      },
      joinHome,
      joinHomeById: async (homeId) => {
        const { error } = await supabase.rpc('join_home_by_id', { hid: homeId });
        if (error) throw error;
        await refresh();
        setActiveHome(homeId);
        return homeId;
      },
      leaveHome: async (homeId) => {
        const { error } = await supabase.from('home_members').delete().eq('home_id', homeId).eq('user_id', userId!);
        if (error) throw error;
        if (activeId === homeId) setActiveId(null);
        await refresh();
      },
    };
  }, [homes, activeId, loading, loadedFor, setActiveHome, refresh, joinHome, userId]);

  return <GroupsContext.Provider value={value}>{children}</GroupsContext.Provider>;
}

export function useGroups() {
  const ctx = useContext(GroupsContext);
  if (!ctx) throw new Error('useGroups must be used inside GroupsProvider');
  return ctx;
}
