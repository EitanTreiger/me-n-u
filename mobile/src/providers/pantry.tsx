import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase';
import type { PantryItem } from '@/lib/types';

import { useAuth } from './auth';

type PantryState = {
  items: PantryItem[];
  names: string[];
  loading: boolean;
  add: (names: string[]) => Promise<void>;
  remove: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const PantryContext = createContext<PantryState | null>(null);

async function fetchPantry(userId: string | undefined): Promise<PantryItem[]> {
  if (!userId) return [];
  const { data } = await supabase.from('pantry_items').select('id, name, created_at').order('name');
  return data ?? [];
}

export function PantryProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [items, setItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setItems(await fetchPantry(userId));
  }, [userId]);

  useEffect(() => {
    let alive = true;
    fetchPantry(userId).then((rows) => {
      if (!alive) return;
      setItems(rows);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  const value = useMemo<PantryState>(
    () => ({
      items,
      names: items.map((i) => i.name),
      loading,
      refresh,
      add: async (names) => {
        const existing = new Set(items.map((i) => i.name.toLowerCase()));
        const fresh = [...new Set(names.map((n) => n.trim()).filter(Boolean))].filter(
          (n) => !existing.has(n.toLowerCase()),
        );
        if (!fresh.length) return;
        const { error } = await supabase.from('pantry_items').insert(fresh.map((name) => ({ name })));
        if (error) throw error;
        await refresh();
      },
      remove: async (id) => {
        setItems((prev) => prev.filter((i) => i.id !== id));
        const { error } = await supabase.from('pantry_items').delete().eq('id', id);
        if (error) await refresh();
      },
    }),
    [items, loading, refresh],
  );

  return <PantryContext.Provider value={value}>{children}</PantryContext.Provider>;
}

export function usePantry() {
  const ctx = useContext(PantryContext);
  if (!ctx) throw new Error('usePantry must be used inside PantryProvider');
  return ctx;
}
