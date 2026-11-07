import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { RecipeThumb } from '@/components/recipe-card';
import { Button, Card, Chip, ErrorBanner, Icon, Loading, Stars, Stepper, T } from '@/components/ui';
import { WeekSwitcher } from '@/components/week-switcher';
import { Colors, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { addMenuItem, listRecipes } from '@/lib/api';
import { formatFactor, servingFactor } from '@/lib/ingredients';
import { consensusScore } from '@/lib/ranking';
import { friendlyError } from '@/lib/supabase';
import { MEALS, type Meal, type RecipeWithStats } from '@/lib/types';
import { DAY_SHORT, weekStart } from '@/lib/week';
import { useGroups } from '@/providers/groups';

const PEOPLE_KEY = 'menuPeople';

/**
 * Admin-only modal. Opened two ways:
 *  - from a menu slot (week/day/meal given) -> pick a recipe
 *  - from a recipe (recipeId given) -> pick the week, day and meal
 */
export default function MenuPick() {
  const params = useLocalSearchParams<{ week?: string; day?: string; meal?: Meal; recipeId?: string; people?: string }>();
  const { active, isAdmin } = useGroups();
  const [week, setWeek] = useState(params.week ?? weekStart());
  const [day, setDay] = useState<number>(params.day ? Number(params.day) : (new Date().getDay() + 6) % 7);
  const [meal, setMeal] = useState<Meal>(params.meal ?? 'dinner');
  const [recipeId, setRecipeId] = useState<string | null>(params.recipeId ?? null);
  const [recipes, setRecipes] = useState<RecipeWithStats[] | null>(null);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // How many people this meal is for. Starts from the recipe page's choice,
  // else the number this admin last used for the group.
  const [people, setPeople] = useState<number | null>(params.people ? Number(params.people) : null);

  const slotFixed = params.day !== undefined && params.meal !== undefined;

  useEffect(() => {
    if (!active || params.people) return;
    let alive = true;
    AsyncStorage.getItem(`${PEOPLE_KEY}:${active.id}`)
      .then((v) => {
        if (alive && v && Number(v) > 0) setPeople((p) => p ?? Number(v));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [active, params.people]);

  useEffect(() => {
    if (!active) return;
    listRecipes(active.id)
      .then((r) => setRecipes(r.sort((a, b) => consensusScore(b.stats) - consensusScore(a.stats))))
      .catch((e) => setError(friendlyError(e)));
  }, [active]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (recipes ?? []).filter((r) => !q || r.title.toLowerCase().includes(q));
  }, [recipes, query]);

  if (!isAdmin) {
    return (
      <View style={{ padding: Spacing.lg }}>
        <ErrorBanner message="Only group admins can plan the menu." />
      </View>
    );
  }

  const selectedRecipe = recipes?.find((r) => r.id === recipeId);
  const cookingFor = people ?? selectedRecipe?.servings ?? 4;

  async function save() {
    if (!active || !recipeId) return;
    setSaving(true);
    try {
      await addMenuItem(active.id, week, day, meal, recipeId, cookingFor);
      AsyncStorage.setItem(`${PEOPLE_KEY}:${active.id}`, String(cookingFor)).catch(() => {});
      router.back();
    } catch (e) {
      setError(friendlyError(e));
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!slotFixed && (
          <>
            <WeekSwitcher week={week} onChange={setWeek} />
            <T variant="label">Day</T>
            <View style={styles.chips}>
              {DAY_SHORT.map((d, i) => (
                <Chip key={d} label={d} selected={day === i} onPress={() => setDay(i)} />
              ))}
            </View>
            <T variant="label" style={{ marginTop: Spacing.md }}>
              Meal
            </T>
            <View style={styles.chips}>
              {MEALS.map((m) => (
                <Chip key={m} label={m[0].toUpperCase() + m.slice(1)} selected={meal === m} onPress={() => setMeal(m)} />
              ))}
            </View>
          </>
        )}

        {slotFixed && (
          <T variant="small" style={{ marginBottom: Spacing.md }}>
            Choose a recipe for {meal} on {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][day]}.
          </T>
        )}

        {params.recipeId && selectedRecipe ? (
          <Card style={[styles.row, { marginTop: Spacing.lg }]}>
            <RecipeThumb recipe={selectedRecipe} size={56} />
            <T variant="subheading" style={{ flex: 1 }}>
              {selectedRecipe.title}
            </T>
          </Card>
        ) : (
          <>
            <View style={[styles.search, !slotFixed && { marginTop: Spacing.lg }]}>
              <Icon name="search" size={18} color={Colors.textMuted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search recipes"
                placeholderTextColor={Colors.textMuted}
                style={styles.searchInput}
              />
            </View>
            {recipes === null ? (
              <Loading />
            ) : filtered.length === 0 ? (
              <T variant="small" style={{ textAlign: 'center', padding: Spacing.xl }}>
                {recipes.length === 0 ? 'Add some recipes to the group first.' : 'No recipes match.'}
              </T>
            ) : (
              <View style={{ gap: Spacing.sm, marginTop: Spacing.md }}>
                {filtered.map((r) => {
                  const selected = r.id === recipeId;
                  return (
                    <Card key={r.id} onPress={() => setRecipeId(r.id)} style={[styles.row, selected && styles.selected]}>
                      <RecipeThumb recipe={r} size={52} />
                      <View style={{ flex: 1, gap: 4 }}>
                        <T variant="subheading" numberOfLines={1}>
                          {r.title}
                        </T>
                        {r.stats.rating_count > 0 ? (
                          <Stars value={r.stats.avg_score} size={12} />
                        ) : (
                          <T variant="small">No ratings yet</T>
                        )}
                      </View>
                      <Icon
                        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                        size={22}
                        color={selected ? Colors.primaryStrong : Colors.borderStrong}
                      />
                    </Card>
                  );
                })}
              </View>
            )}
          </>
        )}
        <ErrorBanner message={error} />
      </ScrollView>
      <View style={styles.footer}>
        <View style={styles.peopleRow}>
          <View style={{ flex: 1 }}>
            <T variant="subheading">Cooking for</T>
            <T variant="small">
              {selectedRecipe?.servings
                ? `Recipe serves ${selectedRecipe.servings}${
                    cookingFor !== selectedRecipe.servings
                      ? ` · ${formatFactor(servingFactor(selectedRecipe.servings, cookingFor))}`
                      : ''
                  }`
                : 'People at this meal'}
            </T>
          </View>
          <Stepper value={cookingFor} onChange={setPeople} label="people" />
        </View>
        <Button title="Add to menu" icon="calendar-outline" onPress={save} loading={saving} disabled={!recipeId} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, paddingBottom: 120, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: Spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  peopleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  selected: { borderColor: Colors.primaryStrong, backgroundColor: Colors.primarySoft },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    minHeight: 46,
  },
  searchInput: { flex: 1, fontSize: 16, color: Colors.text, paddingVertical: Spacing.sm },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});
