import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { GroupGate } from '@/components/group-gate';
import { HomeSwitcher } from '@/components/home-switcher';
import { RecipeCard } from '@/components/recipe-card';
import { Screen } from '@/components/screen';
import { Button, Chip, EmptyState, ErrorBanner, Icon, Loading, T } from '@/components/ui';
import { InputText, Radius, Spacing } from '@/constants/theme';
import { makeStyles, useColors } from '@/providers/appearance';
import { listRecipes } from '@/lib/api';
import { missingIngredients } from '@/lib/ingredients';
import { consensusScore } from '@/lib/ranking';
import { friendlyError } from '@/lib/supabase';
import { useLayout } from '@/hooks/use-layout';
import { DIETARY_TAGS, type RecipeWithStats } from '@/lib/types';
import { useAuth } from '@/providers/auth';
import { useGroups } from '@/providers/groups';
import { usePantry } from '@/providers/pantry';

type Sort = 'top' | 'votes' | 'mine' | 'new' | 'ready';

const SORTS: {
  key: Sort;
  label: string;
  icon: 'trophy-outline' | 'thumbs-up-outline' | 'person-outline' | 'time-outline' | 'checkmark-circle-outline';
}[] = [
  { key: 'top', label: 'Top rated', icon: 'trophy-outline' },
  { key: 'votes', label: 'Most Votes', icon: 'thumbs-up-outline' },
  { key: 'mine', label: 'My recipes', icon: 'person-outline' },
  { key: 'new', label: 'Newest', icon: 'time-outline' },
  { key: 'ready', label: 'Ready to cook', icon: 'checkmark-circle-outline' },
];

function RecipesList() {
  const Colors = useColors();
  const styles = useStyles();
  const { activeHome, isAdmin } = useGroups();
  const { names: pantry } = usePantry();
  const [recipes, setRecipes] = useState<RecipeWithStats[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('top');
  // Switched to a home where you're not an admin: votes aren't yours to see.
  if (sort === 'votes' && !isAdmin) setSort('top');
  const [tags, setTags] = useState<string[]>([]);
  const { wide } = useLayout();
  const userId = useAuth().session?.user.id;

  // Recipes and ratings are shared by every home; menu votes are this home's.
  const homeId = activeHome?.id;

  const load = useCallback(async () => {
    try {
      setRecipes(await listRecipes(homeId));
      setError(null);
    } catch (e) {
      setError(friendlyError(e));
    }
  }, [homeId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const visible = useMemo(() => {
    if (!recipes) return [];
    // Every word must match the title, cuisine/description, an ingredient or a
    // dietary tag, so "chicken", "italian" or "italian chicken" all work.
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let list = recipes.filter((r) => {
      if (tags.length && !tags.every((t) => r.dietary_tags.includes(t))) return false;
      if (!words.length) return true;
      const haystack = [r.title, r.description, ...r.ingredients.map((i) => i.name), ...r.dietary_tags].join(' ').toLowerCase();
      return words.every((w) => haystack.includes(w));
    });
    if (sort === 'top') {
      list = [...list].sort((a, b) => consensusScore(b.stats) - consensusScore(a.stats) || b.stats.rating_count - a.stats.rating_count);
    } else if (sort === 'mine') {
      // Recipes I shared, newest first.
      list = list.filter((r) => r.author_id === userId);
    } else if (sort === 'votes') {
      // Recipes members want on the menu; unvoted ones drop out of this view.
      list = list.filter((r) => r.votes > 0).sort((a, b) => b.votes - a.votes || consensusScore(b.stats) - consensusScore(a.stats));
    } else if (sort === 'ready') {
      list = [...list].sort(
        (a, b) =>
          missingIngredients(pantry, a.ingredients).length - missingIngredients(pantry, b.ingredients).length ||
          consensusScore(b.stats) - consensusScore(a.stats),
      );
    }
    return list;
  }, [recipes, query, sort, tags, pantry, userId]);

  const toggleTag = (t: string) => setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  return (
    <Screen
      title="Recipes"
      subtitle="Shared by every home. Rate what you've made and add photos to its gallery."
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
          placeholder="Search dishes, ingredients or cuisines (e.g. chicken, italian)"
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
        {/* Most Votes: this week's menu votes at this home, for its admins only. */}
        {SORTS.filter((s) => s.key !== 'votes' || isAdmin).map((s) => (
          <Chip key={s.key} label={s.label} icon={s.icon} selected={sort === s.key} onPress={() => setSort(s.key)} />
        ))}
      </View>
      {sort === 'votes' && isAdmin && (
        <View style={styles.votesFor}>
          <T variant="small">Menu votes this week at</T>
          <HomeSwitcher />
        </View>
      )}

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
        sort === 'mine' ? (
          <EmptyState
            icon="person-outline"
            title="You haven't shared a recipe yet"
            body="Recipes you add show up here."
            action={<Button title="Add a recipe" icon="add" onPress={() => router.push('/recipe/new')} />}
          />
        ) : sort === 'votes' ? (
          <EmptyState
            icon="thumbs-up-outline"
            title="No votes this week yet"
            body="When members tap “Vote for the menu” on a recipe, it shows up here, most votes first. Votes reset every Monday."
          />
        ) : (
          <EmptyState icon="search-outline" title="Nothing matches" body="Try a different search or clear the filters." />
        )
      ) : (
        <View style={styles.list}>
          {visible.map((r) => (
            <View key={r.id} style={{ width: '100%' }}>
              <RecipeCard
                recipe={r}
                pantry={pantry}
                large={wide}
                showVotes={isAdmin}
                onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: r.id } })}
              />
            </View>
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

const useStyles = makeStyles((Colors) => ({
  votesFor: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    minHeight: 52,
    marginBottom: Spacing.xs,
  },
  searchInput: { ...InputText, flex: 1, fontSize: 16, color: Colors.text, paddingVertical: Spacing.md },
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md },
  tagRow: { gap: Spacing.sm, paddingVertical: Spacing.md },
  list: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: Spacing.md, marginTop: Spacing.xs },
}));
