import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { normalizeName, normalizeUnit, parseIngredientLine } from '@/lib/ingredients';
import { convertWeight, groceryUnit, isStaple } from '@/lib/pantry-units';
import { supabase } from '@/lib/supabase';
import type { Ingredient, PantryItem } from '@/lib/types';

import { useGroups } from './groups';

/** A pantry change after cooking: new amount, or null to remove the item. */
export type PantryChange = { id: string; quantity: number | null };

type PantryState = {
  items: PantryItem[];
  names: string[];
  loading: boolean;
  /** Add "5 eggs"-style lines or parsed items; amounts merge into existing items. */
  add: (entries: (string | Ingredient)[]) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Set an item's amount; 0 removes it. */
  setQuantity: (id: string, quantity: number) => Promise<void>;
  apply: (changes: PantryChange[]) => Promise<void>;
  refresh: () => Promise<void>;
};

const PantryContext = createContext<PantryState | null>(null);

/** The community's shared pantry. */
async function fetchPantry(groupId: string | undefined): Promise<PantryItem[]> {
  if (!groupId) return [];
  const { data } = await supabase
    .from('pantry_items')
    .select('id, name, quantity, unit, created_at')
    .eq('group_id', groupId)
    .order('name');
  return (data ?? []).map((r) => ({ ...r, quantity: Number(r.quantity) || 0 }));
}

/** Staples have no amount; everything else gets the grocery-store unit by default. */
function normalizeEntry(e: Ingredient): { name: string; quantity: number; unit: string } {
  const name = e.name.split(',')[0].trim().toLowerCase();
  if (isStaple(name)) return { name, quantity: 0, unit: '' };
  const unit = normalizeUnit(e.unit ?? '') || groceryUnit(name);
  // No number given ("eggs") counts as 1.
  return { name, quantity: e.quantity || 1, unit };
}

export function PantryProvider({ children }: { children: ReactNode }) {
  // The pantry belongs to the active community, shared by all its members.
  const groupId = useGroups().active?.id;
  const [items, setItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setItems(await fetchPantry(groupId));
  }, [groupId]);

  useEffect(() => {
    let alive = true;
    fetchPantry(groupId).then((rows) => {
      if (!alive) return;
      setItems(rows);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [groupId]);

  const value = useMemo<PantryState>(
    () => ({
      items,
      names: items.map((i) => i.name),
      loading,
      refresh,
      add: async (entries) => {
        const parsed = entries
          .map((e) => (typeof e === 'string' ? parseIngredientLine(e) : e))
          .filter((e): e is Ingredient => !!e && !!e.name.trim())
          .map(normalizeEntry);
        if (!groupId) return;
        const inserts: { name: string; quantity: number; unit: string }[] = [];
        const updates: { id: string; quantity: number; unit: string }[] = [];
        for (const e of parsed) {
          const key = normalizeName(e.name);
          const saved = items.find((i) => normalizeName(i.name) === key);
          const pending = inserts.find((i) => normalizeName(i.name) === key);
          if (saved) {
            // Same item: add the amounts when they're in the same unit
            // (converting between weights, e.g. 500 g onto 2 lb).
            if (!e.quantity) continue;
            const savedUnit = normalizeUnit(saved.unit);
            const extra = savedUnit === e.unit ? e.quantity : convertWeight(e.quantity, e.unit, savedUnit);
            updates.push({
              id: saved.id,
              quantity: saved.quantity && extra !== null ? Math.round((saved.quantity + extra) * 100) / 100 : saved.quantity || e.quantity,
              unit: saved.quantity ? saved.unit : e.unit,
            });
          } else if (pending) {
            if (pending.unit === e.unit) pending.quantity += e.quantity;
          } else {
            inserts.push(e);
          }
        }
        if (inserts.length) {
          const { error } = await supabase.from('pantry_items').insert(inserts.map((i) => ({ ...i, group_id: groupId })));
          if (error) throw error;
        }
        for (const u of updates) {
          const { error } = await supabase.from('pantry_items').update({ quantity: u.quantity, unit: u.unit }).eq('id', u.id);
          if (error) throw error;
        }
        await refresh();
      },
      remove: async (id) => {
        setItems((prev) => prev.filter((i) => i.id !== id));
        const { error } = await supabase.from('pantry_items').delete().eq('id', id);
        if (error) await refresh();
      },
      setQuantity: async (id, quantity) => {
        // Update the screen straight away, then save.
        setItems((prev) =>
          quantity <= 0 ? prev.filter((i) => i.id !== id) : prev.map((i) => (i.id === id ? { ...i, quantity } : i)),
        );
        const q =
          quantity <= 0
            ? supabase.from('pantry_items').delete().eq('id', id)
            : supabase.from('pantry_items').update({ quantity }).eq('id', id);
        const { error } = await q;
        if (error) await refresh();
      },
      apply: async (changes) => {
        for (const c of changes) {
          const q =
            c.quantity === null || c.quantity <= 0
              ? supabase.from('pantry_items').delete().eq('id', c.id)
              : supabase.from('pantry_items').update({ quantity: c.quantity }).eq('id', c.id);
          const { error } = await q;
          if (error) throw error;
        }
        await refresh();
      },
    }),
    [items, loading, refresh, groupId],
  );

  return <PantryContext.Provider value={value}>{children}</PantryContext.Provider>;
}

export function usePantry() {
  const ctx = useContext(PantryContext);
  if (!ctx) throw new Error('usePantry must be used inside PantryProvider');
  return ctx;
}
