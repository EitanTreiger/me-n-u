import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { GroupGate } from '@/components/group-gate';
import { RecipeCard } from '@/components/recipe-card';
import { Screen } from '@/components/screen';
import { Button, Chip, EmptyState, ErrorBanner, Icon, Loading, T } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { listRecipes } from '@/lib/api';
import { missingIngredients } from '@/lib/ingredients';
import { consensusScore } from '@/lib/ranking';
import { friendlyError } from '@/lib/supabase';
import { DIETARY_TAGS, type RecipeWithStats } from '@/lib/types';
import { useGroups } from '@/providers/groups';
import { usePantry } from '@/providers/pantry';

type Sort = 'top' | 'new' | 'ready';

const SORTS: { key: Sort; label: string; icon: 'trophy-outline' | 'time-outline' | 'checkmark-circle-outline' }[] = [
  { key: 'top', label: 'Top rated', icon: 'trophy-outline' },
  { key: 'new', label: 'Newest', icon: 'time-outline' },
  { key: 'ready', label: 'Ready to cook', icon: 'checkmark-circle-outline' },
];

function RecipesList() {
  const { active } = useGroups();
  const { names: pantry } = usePantry();
  const [recipes, setRecipes] = useState<RecipeWithStats[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('top');
  const [tags, setTags] = useState<string[]>([]);

  const groupId = active!.id;

  const load = useCallback(async () => {
    try {
      setRecipes(await listRecipes(groupId));
      setError(null);
    } catch (e) {
      setError(friendlyError(e));
    }
  }, [groupId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const visible = useMemo(() => {
    if (!recipes) return [];
    const q = query.trim().toLowerCase();
    let list = recipes.filter((r) => {
      if (tags.length && !tags.every((t) => r.dietary_tags.includes(t))) return false;
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        r.ingredients.some((i) => i.name.toLowerCase().includes(q)) ||
        r.dietary_tags.some((t) => t.includes(q))
      );
    });
    if (sort === 'top') {
      list = [...list].sort((a, b) => consensusScore(b.stats) - consensusScore(a.stats) || b.stats.rating_count - a.stats.rating_count);
    } else if (sort === 'ready') {
      list = [...list].sort(
        (a, b) =>
          missingIngredients(pantry, a.ingredients).length - missingIngredients(pantry, b.ingredients).length ||
          consensusScore(b.stats) - consensusScore(a.stats),
      );
    }
    return list;
  }, [recipes, query, sort, tags, pantry]);

  const toggleTag = (t: string) => setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  return (
    <Screen
      title="Recipes"
      subtitle={
        <Pressable onPress={() => router.navigate('/groups')} style={styles.groupPill} accessibilityRole="button">
          <Icon name="home-outline" size={14} color={Colors.primaryStrong} />
          <T variant="small" style={styles.groupName} numberOfLines={1}>
            {active!.name}
          </T>
          <Icon name="chevron-down" size={14} color={Colors.primaryStrong} />
        </Pressable>
      }
      right={<Button title="Add" icon="add" compact onPress={() => router.push('/recipe/new')} />}
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
      }}>
      <View style={styles.search}>
        <Icon name="search" size={18} color={Colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search recipes or ingredients"
          placeholderTextColor={Colors.textMuted}
          style={styles.searchInput}
          returnKeyType="search"
        />
        {!!query && (
          <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear search">
            <Icon name="close-circle" size={18} color={Colors.textMuted} />
          </Pressable>
        )}
      </View>

      <View style={styles.sortRow}>
        {SORTS.map((s) => (
          <Chip key={s.key} label={s.label} icon={s.icon} selected={sort === s.key} onPress={() => setSort(s.key)} />
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagRow}>
        {DIETARY_TAGS.map((t) => (
          <Chip key={t} label={t} selected={tags.includes(t)} onPress={() => toggleTag(t)} />
        ))}
      </ScrollView>

      <ErrorBanner message={error} />

      {recipes === null ? (
        <Loading />
      ) : recipes.length === 0 ? (
        <EmptyState
          icon="book-outline"
          title="No recipes yet"
          body="Add the first one. Type it in, snap a photo of a recipe card, or paste a YouTube link."
          action={<Button title="Add a recipe" icon="add" onPress={() => router.push('/recipe/new')} />}
        />
      ) : visible.length === 0 ? (
        <EmptyState icon="search-outline" title="Nothing matches" body="Try a different search or clear the filters." />
      ) : (
        <View style={styles.list}>
          {visible.map((r, i) => (
            <RecipeCard
              key={r.id}
              recipe={r}
              pantry={pantry}
              rank={sort === 'top' && r.stats.rating_count > 0 ? i + 1 : undefined}
              onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: r.id } })}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

export default function RecipesTab() {
  return (
    <GroupGate title="Recipes">
      <RecipesList />
    </GroupGate>
  );
}

const styles = StyleSheet.create({
  groupPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingVertical: 2,
  },
  groupName: { color: Colors.primaryStrong, fontWeight: '600', maxWidth: 220 },
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
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md },
  tagRow: { gap: Spacing.sm, paddingVertical: Spacing.md },
  list: { gap: Spacing.md, marginTop: Spacing.xs },
});
