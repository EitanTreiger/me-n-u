import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase';
import type { Group, Membership, Role } from '@/lib/types';

import { useAuth } from './auth';

const ACTIVE_KEY = 'activeGroupId';

type GroupsState = {
  memberships: Membership[];
  active: Membership | null;
  isAdmin: boolean;
  loading: boolean;
  setActive: (groupId: string) => void;
  refresh: () => Promise<void>;
  createGroup: (name: string, description: string) => Promise<Group>;
  joinGroup: (code: string) => Promise<string>;
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

export function GroupsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Which signed-in user the memberships were loaded for, so a fresh sign-in
  // counts as "loading" until their communities arrive.
  const [loadedFor, setLoadedFor] = useState<string | undefined | null>(null);

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

  const setActive = useCallback((groupId: string) => {
    setActiveId(groupId);
    AsyncStorage.setItem(ACTIVE_KEY, groupId).catch(() => {});
  }, []);

  const value = useMemo<GroupsState>(() => {
    const active = memberships.find((m) => m.id === activeId) ?? null;
    return {
      memberships,
      active,
      isAdmin: active?.role === 'admin',
      loading: loading || loadedFor !== userId,
      setActive,
      refresh,
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
      joinGroup: async (code) => {
        const { data, error } = await supabase.rpc('join_group', { code });
        if (error) throw error;
        await refresh();
        setActive(data as string);
        return data as string;
      },
      leaveGroup: async (groupId) => {
        const { error } = await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId!);
        if (error) throw error;
        if (activeId === groupId) setActiveId(null);
        await refresh();
      },
    };
  }, [memberships, activeId, loading, loadedFor, setActive, refresh, userId]);

  return <GroupsContext.Provider value={value}>{children}</GroupsContext.Provider>;
}

export function useGroups() {
  const ctx = useContext(GroupsContext);
  if (!ctx) throw new Error('useGroups must be used inside GroupsProvider');
  return ctx;
}
