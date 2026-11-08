import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { GroupGate } from '@/components/group-gate';
import { HomeSwitcher } from '@/components/home-switcher';
import { Screen } from '@/components/screen';
import { Button, Card, Divider, EmptyState, ErrorBanner, Field, Icon, IconButton, Loading, SectionHeader, T } from '@/components/ui';
import { WeekSwitcher } from '@/components/week-switcher';
import { Radius, Spacing } from '@/constants/theme';
import { makeStyles, useColors } from '@/providers/appearance';
import {
  addGroceryExtra,
  listGroceryState,
  listMenu,
  removeGroceryExtra,
  setChecked,
  type GroceryExtra,
} from '@/lib/api';
import {
  aggregateIngredients,
  formatIngredient,
  scaleIngredients,
  servingFactor,
  tidyAmount,
  type GroceryLine,
} from '@/lib/ingredients';
import { shareText } from '@/lib/share';
import { friendlyError } from '@/lib/supabase';
import type { MenuItem } from '@/lib/types';
import { weekLabel, weekStart } from '@/lib/week';
import { useGroups } from '@/providers/groups';

function lineText(line: { name: string; quantity: number; unit: string }) {
  return formatIngredient(tidyAmount(line));
}

function GroceryList() {
  const Colors = useColors();
  const styles = useStyles();
  const params = useLocalSearchParams<{ week?: string }>();
  const { activeHome, isAdmin } = useGroups();
  const [week, setWeek] = useState(params.week ?? weekStart());
  const [menu, setMenu] = useState<MenuItem[] | null>(null);
  const [checked, setCheckedKeys] = useState<Set<string>>(new Set());
  const [extras, setExtras] = useState<GroceryExtra[]>([]);
  const [newExtra, setNewExtra] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Each home shops for its own menu.
  const homeId = activeHome!.id;

  // Switching home: don't show the previous home's list while the new one loads.
  const [shownHome, setShownHome] = useState(homeId);
  if (homeId !== shownHome) {
    setShownHome(homeId);
    setMenu(null);
  }

  // When the Menu tab links here with a week, follow it.
  const [linkedWeek, setLinkedWeek] = useState(params.week);
  if (params.week !== linkedWeek) {
    setLinkedWeek(params.week);
    if (params.week) setWeek(params.week);
  }

  const load = useCallback(async () => {
    try {
      const [m, state] = await Promise.all([listMenu(homeId, week), listGroceryState(homeId, week)]);
      setMenu(m);
      setCheckedKeys(state.checked);
      setExtras(state.extras);
      setError(null);
    } catch (e) {
      setError(friendlyError(e));
    }
  }, [homeId, week]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const lines = useMemo(
    () =>
      aggregateIngredients(
        (menu ?? [])
          .filter((m) => m.recipe)
          .map((m) => ({
            recipeTitle: m.recipe!.title,
            // Scale each planned meal to the number of people it's for.
            // Keep raw amounts here; the combined total is rounded once for display.
            ingredients: scaleIngredients(m.recipe!.ingredients, servingFactor(m.recipe!.servings, m.servings), {
              tidy: false,
            }),
          })),
      ),
    [menu],
  );
  const toBuy = lines;

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
      await setChecked(homeId, week, key, next);
    } catch (e) {
      setError(friendlyError(e));
      load();
    }
  }

  async function addExtra() {
    if (!newExtra.trim()) return;
    try {
      await addGroceryExtra(homeId, week, newExtra);
      setNewExtra('');
      load();
    } catch (e) {
      setError(friendlyError(e));
    }
  }

  async function share() {
    const items = [...toBuy.map(lineText), ...extras.map((e) => e.name)];
    setNotice(null);
    try {
      const result = await shareText(
        `Groceries for ${activeHome!.name} (${weekLabel(week)}):\n\n${items.map((i) => `• ${i}`).join('\n')}`,
        'Grocery list',
      );
      if (result === 'copied') setNotice('Grocery list copied. Paste it into a message or note.');
    } catch (e) {
      setError(friendlyError(e));
    }
  }

  const recipeCount = new Set((menu ?? []).map((m) => m.recipe_id)).size;

  return (
    <Screen
      title="Groceries"
      subtitle={
        <View style={{ gap: Spacing.xs }}>
          <HomeSwitcher />
          {menu && <T variant="small">{`${recipeCount} recipe${recipeCount === 1 ? '' : 's'} on the menu`}</T>}
        </View>
      }
      right={total > 0 ? <IconButton name="share-outline" label="Share list" onPress={share} /> : undefined}
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await load();
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
      {notice && (
        <T variant="small" style={{ color: Colors.success }}>
          {notice}
        </T>
      )}

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
            {toBuy.map((l, i) => (
              <View key={l.key}>
                {i > 0 && <Divider />}
                <Line
                  line={l}
                  checked={checked.has(l.key)}
                  onToggle={() => toggle(l.key)}
                />
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

        </>
      )}
    </Screen>
  );
}

function Line({
  line,
  note,
  checked,
  onToggle,
  onRemove,
}: {
  line: GroceryLine;
  /** Extra detail shown before the recipe names. */
  note?: string;
  checked: boolean;
  onToggle: () => void;
  onRemove?: () => void;
}) {
  const Colors = useColors();
  const styles = useStyles();
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
            {[note, line.recipes.join(', ')].filter(Boolean).join(' · ')}
          </T>
        </View>
      </Pressable>
      {onRemove && <IconButton name="close" size={18} color={Colors.textMuted} label={`Remove ${line.name}`} onPress={onRemove} />}
    </View>
  );
}

export default function GroceriesTab() {
  return (
    <GroupGate title="Groceries" adminOnly>
      <GroceryList />
    </GroupGate>
  );
}

const useStyles = makeStyles((Colors) => ({
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
}));
