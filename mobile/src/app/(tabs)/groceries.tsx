import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';

import { GroupGate } from '@/components/group-gate';
import { Screen } from '@/components/screen';
import { Button, Card, Divider, EmptyState, ErrorBanner, Field, Icon, IconButton, Loading, SectionHeader, T } from '@/components/ui';
import { WeekSwitcher } from '@/components/week-switcher';
import { Colors, Radius, Spacing } from '@/constants/theme';
import {
  addGroceryExtra,
  listGroceryState,
  listMenu,
  removeGroceryExtra,
  setChecked,
  type GroceryExtra,
} from '@/lib/api';
import { aggregateIngredients, displayUnit, formatQuantity, pantryHas, type GroceryLine } from '@/lib/ingredients';
import { friendlyError } from '@/lib/supabase';
import type { MenuItem } from '@/lib/types';
import { weekLabel, weekStart } from '@/lib/week';
import { useGroups } from '@/providers/groups';
import { usePantry } from '@/providers/pantry';

function lineText(l: { name: string; quantity: number; unit: string }) {
  return [formatQuantity(l.quantity), displayUnit(l.unit, l.quantity), l.name].filter(Boolean).join(' ');
}

function GroceryList() {
  const params = useLocalSearchParams<{ week?: string }>();
  const { active, isAdmin } = useGroups();
  const pantry = usePantry();
  const [week, setWeek] = useState(params.week ?? weekStart());
  const [menu, setMenu] = useState<MenuItem[] | null>(null);
  const [checked, setCheckedKeys] = useState<Set<string>>(new Set());
  const [extras, setExtras] = useState<GroceryExtra[]>([]);
  const [newExtra, setNewExtra] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const groupId = active!.id;

  // When the Menu tab links here with a week, follow it.
  const [linkedWeek, setLinkedWeek] = useState(params.week);
  if (params.week !== linkedWeek) {
    setLinkedWeek(params.week);
    if (params.week) setWeek(params.week);
  }

  const load = useCallback(async () => {
    try {
      const [m, state] = await Promise.all([listMenu(groupId, week), listGroceryState(groupId, week)]);
      setMenu(m);
      setCheckedKeys(state.checked);
      setExtras(state.extras);
      setError(null);
    } catch (e) {
      setError(friendlyError(e));
    }
  }, [groupId, week]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const lines = useMemo(
    () =>
      aggregateIngredients(
        (menu ?? []).filter((m) => m.recipe).map((m) => ({ recipeTitle: m.recipe!.title, ingredients: m.recipe!.ingredients })),
      ),
    [menu],
  );
  const toBuy = lines.filter((l) => !pantryHas(pantry.names, l.name));
  const inPantry = lines.filter((l) => pantryHas(pantry.names, l.name));

  const total = toBuy.length + extras.length;
  const done = toBuy.filter((l) => checked.has(l.key)).length + extras.filter((e) => checked.has(`extra:${e.id}`)).length;

  async function toggle(key: string) {
    const next = !checked.has(key);
    setCheckedKeys((prev) => {
      const s = new Set(prev);
      if (next) s.add(key);
      else s.delete(key);
      return s;
    });
    try {
      await setChecked(groupId, week, key, next);
    } catch (e) {
      setError(friendlyError(e));
      load();
    }
  }

  async function addExtra() {
    if (!newExtra.trim()) return;
    try {
      await addGroceryExtra(groupId, week, newExtra);
      setNewExtra('');
      load();
    } catch (e) {
      setError(friendlyError(e));
    }
  }

  async function share() {
    const items = [...toBuy.map(lineText), ...extras.map((e) => e.name)];
    await Share.share({
      message: `Groceries for ${active!.name} (${weekLabel(week)}):\n\n${items.map((i) => `• ${i}`).join('\n')}`,
    });
  }

  const recipeCount = new Set((menu ?? []).map((m) => m.recipe_id)).size;

  return (
    <Screen
      title="Groceries"
      subtitle={menu ? `${recipeCount} recipe${recipeCount === 1 ? '' : 's'} on the menu` : undefined}
      right={total > 0 ? <IconButton name="share-outline" label="Share list" onPress={share} /> : undefined}
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await Promise.all([load(), pantry.refresh()]);
        setRefreshing(false);
      }}>
      <WeekSwitcher
        week={week}
        onChange={(w) => {
          setMenu(null);
          setWeek(w);
        }}
      />
      <ErrorBanner message={error} />

      {menu === null ? (
        <Loading />
      ) : lines.length === 0 && extras.length === 0 ? (
        <EmptyState
          icon="cart-outline"
          title="Nothing on the list yet"
          body={
            isAdmin
              ? 'Plan meals for this week and the grocery list builds itself from their ingredients.'
              : 'Once an admin plans meals for this week, the list builds itself from their ingredients.'
          }
          action={isAdmin ? <Button title="Plan the menu" icon="calendar-outline" onPress={() => router.navigate('/menu')} /> : undefined}
        />
      ) : (
        <>
          {total > 0 && (
            <View style={styles.progress}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${(done / total) * 100}%` }]} />
              </View>
              <T variant="small">
                {done} of {total} picked up
              </T>
            </View>
          )}

          <SectionHeader title={`To buy · ${toBuy.length + extras.length}`} />
          <Card style={styles.list}>
            {toBuy.length === 0 && extras.length === 0 && (
              <T variant="small" style={{ padding: Spacing.md }}>
                Your pantry covers everything on the menu.
              </T>
            )}
            {toBuy.map((l, i) => (
              <View key={l.key}>
                {i > 0 && <Divider />}
                <Line line={l} checked={checked.has(l.key)} onToggle={() => toggle(l.key)} />
              </View>
            ))}
            {extras.map((e, i) => {
              const key = `extra:${e.id}`;
              return (
                <View key={e.id}>
                  {(i > 0 || toBuy.length > 0) && <Divider />}
                  <Line
                    line={{ key, name: e.name, quantity: e.quantity, unit: e.unit, recipes: ['Added by an admin'] }}
                    checked={checked.has(key)}
                    onToggle={() => toggle(key)}
                    onRemove={
                      isAdmin
                        ? async () => {
                            setExtras((prev) => prev.filter((x) => x.id !== e.id));
                            await removeGroceryExtra(e.id).catch((err) => setError(friendlyError(err)));
                          }
                        : undefined
                    }
                  />
                </View>
              );
            })}
          </Card>

          {isAdmin && (
            <View style={styles.addRow}>
              <View style={{ flex: 1 }}>
                <Field value={newExtra} onChangeText={setNewExtra} placeholder="Add something else (e.g. paper towels)" onSubmitEditing={addExtra} returnKeyType="done" />
              </View>
              <Button title="Add" compact onPress={addExtra} disabled={!newExtra.trim()} style={{ minHeight: 48 }} />
            </View>
          )}

          {inPantry.length > 0 && (
            <>
              <SectionHeader title={`Already in your pantry · ${inPantry.length}`} />
              <Card style={[styles.list, styles.muted]}>
                {inPantry.map((l, i) => (
                  <View key={l.key}>
                    {i > 0 && <Divider />}
                    <View style={styles.line}>
                      <Icon name="basket-outline" size={18} color={Colors.success} />
                      <View style={{ flex: 1 }}>
                        <T style={{ color: Colors.textSecondary }}>{lineText(l)}</T>
                      </View>
                    </View>
                  </View>
                ))}
              </Card>
            </>
          )}
        </>
      )}
    </Screen>
  );
}

function Line({
  line,
  checked,
  onToggle,
  onRemove,
}: {
  line: GroceryLine;
  checked: boolean;
  onToggle: () => void;
  onRemove?: () => void;
}) {
  return (
    <View style={styles.line}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={lineText(line)}
        style={({ pressed }) => [styles.lineMain, pressed && { opacity: 0.6 }]}>
        <View style={[styles.checkbox, checked && styles.checkboxOn]}>
          {checked && <Icon name="checkmark" size={16} color={Colors.onPrimary} />}
        </View>
        <View style={{ flex: 1 }}>
          <T style={checked ? styles.checkedText : undefined}>{lineText(line)}</T>
          <T variant="small" numberOfLines={1} style={{ color: Colors.textMuted }}>
            {line.recipes.join(', ')}
          </T>
        </View>
      </Pressable>
      {onRemove && <IconButton name="close" size={18} color={Colors.textMuted} label={`Remove ${line.name}`} onPress={onRemove} />}
    </View>
  );
}

export default function GroceriesTab() {
  return (
    <GroupGate title="Groceries">
      <GroceryList />
    </GroupGate>
  );
}

const styles = StyleSheet.create({
  progress: { gap: Spacing.sm, marginBottom: Spacing.xs },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: Colors.border, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: Colors.primary },
  list: { paddingVertical: Spacing.xs, paddingHorizontal: Spacing.md },
  muted: { backgroundColor: Colors.background },
  line: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
  lineMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: Radius.sm - 2,
    borderWidth: 2,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  checkedText: { textDecorationLine: 'line-through', color: Colors.textMuted },
  addRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start', marginTop: Spacing.md },
});
