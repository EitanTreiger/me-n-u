import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { GroupGate } from '@/components/group-gate';
import { Screen } from '@/components/screen';
import { Button, Card, Chip, Divider, ErrorBanner, Icon, IconButton, Loading, T } from '@/components/ui';
import { WeekSwitcher } from '@/components/week-switcher';
import { Radius, Spacing } from '@/constants/theme';
import { makeStyles, useColors } from '@/providers/appearance';
import { useLayout } from '@/hooks/use-layout';
import { listMenu, removeMenuItem } from '@/lib/api';
import { friendlyError } from '@/lib/supabase';
import { MEALS, type Meal, type MenuItem } from '@/lib/types';
import { DAY_NAMES, dayDate, formatShort, todayIndex, weekStart } from '@/lib/week';
import { useGroups } from '@/providers/groups';

const MEAL_LABEL: Record<Meal, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };

function MenuPlanner() {
  const Colors = useColors();
  const styles = useStyles();
  const { active, isAdmin } = useGroups();
  const [week, setWeek] = useState(weekStart());
  const [items, setItems] = useState<MenuItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const groupId = active!.id;

  const load = useCallback(async () => {
    try {
      setItems(await listMenu(groupId, week));
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

  const changeWeek = (w: string) => {
    setItems(null);
    setWeek(w);
  };

  async function remove(id: string) {
    setItems((prev) => prev?.filter((i) => i.id !== id) ?? null);
    try {
      await removeMenuItem(id);
    } catch (e) {
      setError(friendlyError(e));
      load();
    }
  }

  const today = todayIndex(week);
  const { columns } = useLayout();
  const plannedCount = items?.length ?? 0;

  return (
    <Screen
      title="Weekly menu"
      subtitle={isAdmin ? 'You are an admin. Tap + to plan a meal.' : `Planned by the admins of ${active!.name}.`}
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
      }}>
      <WeekSwitcher week={week} onChange={changeWeek} />
      <ErrorBanner message={error} />

      {items === null ? (
        <Loading />
      ) : (
        <View style={{ gap: Spacing.md }}>
          {plannedCount > 0 && (
            <Button
              title={`Grocery list for this week · ${plannedCount} meal${plannedCount === 1 ? '' : 's'}`}
              icon="cart-outline"
              variant="secondary"
              onPress={() => router.navigate({ pathname: '/groceries', params: { week } })}
            />
          )}
          <View style={styles.days}>
          {DAY_NAMES.map((dayName, day) => {
            const isToday = day === today;
            return (
              <Card
                key={day}
                style={[styles.day, isToday && styles.today, { width: columns > 1 ? `${100 / columns - 1.5}%` : '100%' }]}>
                <View style={styles.dayHeader}>
                  <T variant="subheading">{dayName}</T>
                  <T variant="small">{formatShort(dayDate(week, day))}</T>
                  {isToday && <Chip label="Today" selected />}
                </View>
                {MEALS.map((meal, mi) => {
                  const planned = items.filter((i) => i.day === day && i.meal === meal);
                  return (
                    <View key={meal}>
                      {mi > 0 && <Divider />}
                      <View style={styles.slot}>
                        <T variant="label" style={styles.mealLabel}>
                          {MEAL_LABEL[meal]}
                        </T>
                        <View style={{ flex: 1, gap: 6 }}>
                          {planned.length === 0 && !isAdmin && (
                            <T variant="small" style={{ color: Colors.textMuted }}>
                              Not planned
                            </T>
                          )}
                          {planned.map((p) => (
                            <View key={p.id} style={styles.plannedRow}>
                              <Pressable
                                style={{ flex: 1 }}
                                onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: p.recipe_id } })}>
                                <T numberOfLines={1} style={styles.recipeLink}>
                                  {p.recipe?.title ?? 'Recipe removed'}
                                </T>
                                {!!p.servings && (
                                  <T variant="small">
                                    For {p.servings} {p.servings === 1 ? 'person' : 'people'}
                                  </T>
                                )}
                              </Pressable>
                              {isAdmin && (
                                <IconButton
                                  name="close"
                                  size={18}
                                  color={Colors.textMuted}
                                  label={`Remove ${p.recipe?.title ?? 'meal'}`}
                                  onPress={() => remove(p.id)}
                                />
                              )}
                            </View>
                          ))}
                        </View>
                        {isAdmin && (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Add ${MEAL_LABEL[meal].toLowerCase()} on ${dayName}`}
                            hitSlop={8}
                            onPress={() =>
                              router.push({ pathname: '/menu-pick', params: { week, day: String(day), meal } })
                            }
                            style={({ pressed }) => [styles.add, pressed && { opacity: 0.6 }]}>
                            <Icon name="add" size={18} color={Colors.primaryStrong} />
                          </Pressable>
                        )}
                      </View>
                    </View>
                  );
                })}
              </Card>
            );
          })}
          </View>
        </View>
      )}
    </Screen>
  );
}

export default function MenuTab() {
  return (
    <GroupGate title="Weekly menu">
      <MenuPlanner />
    </GroupGate>
  );
}

const useStyles = makeStyles((Colors) => ({
  days: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: Spacing.md },
  day: { paddingVertical: Spacing.md },
  today: { borderColor: Colors.primary, borderWidth: 2 },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xs },
  slot: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm, minHeight: 44 },
  mealLabel: { width: 82 },
  plannedRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  recipeLink: { fontWeight: '500' },
  add: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primarySoft,
  },
}));
