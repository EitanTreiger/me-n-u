import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase';
import type { Group, Home, Membership, Role } from '@/lib/types';

import { useAuth } from './auth';

const ACTIVE_KEY = 'activeGroupId';
const activeHomeKey = (groupId: string) => `activeHomeId:${groupId}`;
// A home code from a join link, kept until the person has signed in.
const PENDING_JOIN_KEY = 'pendingJoinCode';

/** Remember a join link's code so it's used as soon as the person is signed in. */
export function rememberJoinCode(code: string) {
  return AsyncStorage.setItem(PENDING_JOIN_KEY, code.trim().toUpperCase()).catch(() => {});
}

type GroupsState = {
  /** Communities the user belongs to. */
  memberships: Membership[];
  /** The community being viewed (recipes are shared across it). */
  active: Membership | null;
  isAdmin: boolean;
  /** Homes in the active community. */
  homes: Home[];
  /** The home being viewed: its menu, groceries and pantry are shown. */
  activeHome: Home | null;
  loading: boolean;
  /** The active community's homes are still loading. */
  homesLoading: boolean;
  setActive: (groupId: string) => void;
  setActiveHome: (homeId: string) => void;
  refresh: () => Promise<void>;
  createGroup: (name: string, description: string) => Promise<Group>;
  createHome: (name: string) => Promise<Home>;
  /** Join a home (and its community) with the home's code. */
  joinHome: (code: string) => Promise<string>;
  leaveGroup: (groupId: string) => Promise<void>;
};

const GroupsContext = createContext<GroupsState | null>(null);

async function fetchMemberships(userId: string | undefined): Promise<{ rows: Membership[]; stored: string | null } | null> {
  if (!userId) return { rows: [], stored: null };
  const { data, error } = await supabase
    .from('group_members')
    .select('role, groups(*)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: true });
  if (error || !data) return null;
  const rows = (data as unknown as { role: Role; groups: Group }[])
    .filter((r) => r.groups)
    .map((r) => ({ ...r.groups, role: r.role }));
  const stored = await AsyncStorage.getItem(ACTIVE_KEY).catch(() => null);
  return { rows, stored };
}

async function fetchHomes(groupId: string): Promise<Home[]> {
  const { data, error } = await supabase
    .from('homes')
    .select('id, group_id, name, invite_code, created_at, home_members(user_id)')
    .eq('group_id', groupId)
    .order('created_at');
  if (error) throw error;
  return (data as unknown as (Omit<Home, 'members'> & { home_members: { user_id: string }[] })[]).map(
    ({ home_members, ...h }) => ({ ...h, members: home_members.map((m) => m.user_id) }),
  );
}

async function fetchHomeState(groupId: string): Promise<{ rows: Home[]; stored: string | null }> {
  const rows = await fetchHomes(groupId).catch(() => [] as Home[]);
  const stored = await AsyncStorage.getItem(activeHomeKey(groupId)).catch(() => null);
  return { rows, stored };
}

export function GroupsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Which signed-in user the memberships were loaded for, so a fresh sign-in
  // counts as "loading" until their communities arrive.
  const [loadedFor, setLoadedFor] = useState<string | undefined | null>(null);
  const [homes, setHomes] = useState<Home[]>([]);
  const [activeHomeId, setActiveHomeId] = useState<string | null>(null);
  // Which community the homes were loaded for.
  const [homesFor, setHomesFor] = useState<string | null>(null);

  const apply = useCallback((result: { rows: Membership[]; stored: string | null } | null) => {
    if (result) {
      setMemberships(result.rows);
      setActiveId((current) => {
        const candidate = current ?? result.stored;
        return result.rows.some((g) => g.id === candidate) ? candidate : (result.rows[0]?.id ?? null);
      });
    }
    setLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    apply(await fetchMemberships(userId));
  }, [userId, apply]);

  useEffect(() => {
    let alive = true;
    fetchMemberships(userId).then((result) => {
      if (!alive) return;
      apply(result);
      setLoadedFor(userId);
    });
    return () => {
      alive = false;
    };
  }, [userId, apply]);

  // Homes of the active community. Keep the chosen home, else the one saved
  // for this community, else the first home the user lives in, else the first.
  const applyHomes = useCallback(
    (groupId: string, { rows, stored }: { rows: Home[]; stored: string | null }) => {
      setHomes(rows);
      setActiveHomeId((current) => {
        for (const candidate of [current, stored]) if (rows.some((h) => h.id === candidate)) return candidate;
        return (rows.find((h) => userId && h.members.includes(userId)) ?? rows[0])?.id ?? null;
      });
      setHomesFor(groupId);
    },
    [userId],
  );

  const loadHomes = useCallback(
    async (groupId: string) => applyHomes(groupId, await fetchHomeState(groupId)),
    [applyHomes],
  );

  useEffect(() => {
    if (!activeId) return;
    let alive = true;
    fetchHomeState(activeId).then((result) => {
      if (alive) applyHomes(activeId, result);
    });
    return () => {
      alive = false;
    };
  }, [activeId, applyHomes]);

  const setActive = useCallback(
    (groupId: string) => {
      // A different community: its home is picked again once its homes load.
      if (groupId !== activeId) setActiveHomeId(null);
      setActiveId(groupId);
      AsyncStorage.setItem(ACTIVE_KEY, groupId).catch(() => {});
    },
    [activeId],
  );

  const setActiveHome = useCallback(
    (homeId: string) => {
      setActiveHomeId(homeId);
      if (activeId) AsyncStorage.setItem(activeHomeKey(activeId), homeId).catch(() => {});
    },
    [activeId],
  );

  const joinHome = useCallback(
    async (code: string) => {
      const { data: homeId, error } = await supabase.rpc('join_home', { code: code.trim().toUpperCase() });
      if (error) throw error;
      const { data: home } = await supabase.from('homes').select('group_id').eq('id', homeId).single();
      await refresh();
      if (home) {
        await AsyncStorage.setItem(activeHomeKey(home.group_id), homeId).catch(() => {});
        setActive(home.group_id);
        setActiveHomeId(homeId);
        await loadHomes(home.group_id);
      }
      return homeId as string;
    },
    [refresh, setActive, loadHomes],
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
    const active = memberships.find((m) => m.id === activeId) ?? null;
    // Only the active community's homes (ignores ones left over while switching).
    const activeHomes = homes.filter((h) => h.group_id === active?.id);
    const activeHome = activeHomes.find((h) => h.id === activeHomeId) ?? null;
    return {
      memberships,
      active,
      isAdmin: active?.role === 'admin',
      homes: activeHomes,
      activeHome,
      loading: loading || loadedFor !== userId,
      homesLoading: !!active && homesFor !== active.id,
      setActive,
      setActiveHome,
      refresh: async () => {
        await refresh();
        if (activeId) await loadHomes(activeId);
      },
      createGroup: async (name, description) => {
        const { data, error } = await supabase
          .from('groups')
          .insert({ name: name.trim(), description: description.trim() })
          .select()
          .single();
        if (error) throw error;
        await refresh();
        setActive(data.id);
        return data as Group;
      },
      createHome: async (name) => {
        if (!activeId) throw new Error('Pick a community first.');
        const { data, error } = await supabase
          .from('homes')
          .insert({ group_id: activeId, name: name.trim() })
          .select('id, group_id, name, invite_code, created_at')
          .single();
        if (error) throw error;
        await loadHomes(activeId);
        return { ...(data as Omit<Home, 'members'>), members: [] };
      },
      joinHome,
      leaveGroup: async (groupId) => {
        const { error } = await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId!);
        if (error) throw error;
        // Leaving the community also leaves its homes.
        const ids = homes.filter((h) => h.group_id === groupId).map((h) => h.id);
        if (ids.length) await supabase.from('home_members').delete().in('home_id', ids).eq('user_id', userId!);
        if (activeId === groupId) setActiveId(null);
        await refresh();
      },
    };
  }, [memberships, activeId, homes, activeHomeId, homesFor, loading, loadedFor, setActive, setActiveHome, refresh, loadHomes, joinHome, userId]);

  return <GroupsContext.Provider value={value}>{children}</GroupsContext.Provider>;
}

export function useGroups() {
  const ctx = useContext(GroupsContext);
  if (!ctx) throw new Error('useGroups must be used inside GroupsProvider');
  return ctx;
}
