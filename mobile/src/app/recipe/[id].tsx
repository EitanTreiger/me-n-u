import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Card, Chip, Divider, ErrorBanner, Icon, IconButton, Loading, SectionHeader, Stars, Stepper, T } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useLayout } from '@/hooks/use-layout';
import { deleteRecipe, getRecipe, rateRecipe, setMenuVote } from '@/lib/api';
import {
  formatFactor,
  formatIngredient,
  pantryHas,
  pantryUsage,
  scaleIngredients,
  servingFactor,
  type PantryUse,
} from '@/lib/ingredients';
import { youtubeThumb } from '@/lib/ranking';
import { friendlyError, photoUrl } from '@/lib/supabase';
import type { RecipeWithStats } from '@/lib/types';
import { formatTimestamp, youtubeAt } from '@/lib/youtube';
import { useGroups } from '@/providers/groups';
import { usePantry } from '@/providers/pantry';

function confirm(title: string, message: string, onYes: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onYes();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onYes },
  ]);
}

export default function RecipeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isAdmin } = useGroups();
  const pantry = usePantry();
  const { wide, contentWidth } = useLayout();
  const [recipe, setRecipe] = useState<RecipeWithStats | null>(null);
  const [myScore, setMyScore] = useState<number | null>(null);
  const [timesOnMenu, setTimesOnMenu] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [voting, setVoting] = useState(false);
  // Serving scaler. `people` = how many we're cooking for; `baseGuess` is used
  // only when the recipe doesn't say how many it serves.
  const [people, setPeople] = useState<number | null>(null);
  const [baseGuess, setBaseGuess] = useState(4);
  // "I made this" panel: which pantry changes to apply.
  const [madeIt, setMadeIt] = useState(false);
  const [usage, setUsage] = useState<(PantryUse & { apply: boolean })[]>([]);
  const [saving, setSaving] = useState(false);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getRecipe(id)
      .then((res) => {
        if (!alive) return;
        setRecipe(res.recipe);
        setMyScore(res.myScore);
        setTimesOnMenu(res.timesOnMenu);
      })
      .catch((e) => alive && setError(friendlyError(e)));
    return () => {
      alive = false;
    };
  }, [id]);

  if (error && !recipe) {
    return (
      <View style={{ padding: Spacing.lg }}>
        <ErrorBanner message={error} />
      </View>
    );
  }
  if (!recipe) return <Loading />;

  const image = photoUrl(recipe.photo_path) ?? recipe.image_url ?? youtubeThumb(recipe.video_url);
  const base = recipe.servings ?? baseGuess;
  const cookingFor = people ?? base;
  const factor = servingFactor(base, cookingFor);
  const ingredients = scaleIngredients(recipe.ingredients, factor);
  const missing = ingredients.filter((i) => !pantryHas(pantry.names, i.name));
  // Only admins can delete (the database enforces this too).
  const canDelete = isAdmin;
  const times = recipe.video_url && recipe.step_timestamps?.length === recipe.steps.length ? recipe.step_timestamps : null;

  async function refreshRecipe() {
    const res = await getRecipe(recipe!.id);
    setRecipe(res.recipe);
  }

  async function rate(score: number) {
    const previous = myScore;
    setMyScore(score);
    try {
      await rateRecipe(recipe!.id, score);
      await refreshRecipe();
    } catch (e) {
      setMyScore(previous);
      setError(friendlyError(e));
    }
  }

  async function toggleVote() {
    setVoting(true);
    try {
      await setMenuVote(recipe!.id, !recipe!.myVote);
      await refreshRecipe();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setVoting(false);
    }
  }

  async function addMissingToPantry() {
    setAdding(true);
    try {
      await pantry.add(missing);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setAdding(false);
    }
  }

  function openMadeIt() {
    // Pre-tick the changes we can work out; leave "used up?" ones for the cook.
    setUsage(pantryUsage(pantry.items, ingredients).map((u) => ({ ...u, apply: u.after !== null })));
    setDoneMessage(null);
    setMadeIt(true);
  }

  async function finishMadeIt() {
    setSaving(true);
    try {
      await pantry.apply(usage.filter((u) => u.apply).map((u) => ({ id: u.pantryId, quantity: u.after })));
      setMadeIt(false);
      setDoneMessage(myScore ? 'Pantry updated. Thanks for cooking!' : 'Pantry updated. How was it? Rate it above.');
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  // ---- Sections (arranged in one or two columns below) ----

  const hero = image && (
    <Pressable
      disabled={!recipe.video_url}
      onPress={() => recipe.video_url && Linking.openURL(recipe.video_url)}
      style={styles.hero}
      accessibilityRole={recipe.video_url ? 'link' : 'image'}
      accessibilityLabel={recipe.video_url ? 'Watch the video on YouTube' : recipe.title}>
      <Image source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
      {recipe.video_url && (
        <View style={styles.playOverlay}>
          <View style={styles.playButton}>
            <Icon name="play" size={26} color="#FFFFFF" />
          </View>
        </View>
      )}
    </Pressable>
  );

  const info = (
    <>
      <View style={styles.titleBlock}>
        <T variant="title">{recipe.title}</T>
        <T variant="small">
          Shared by {recipe.author?.display_name || 'a member'}
          {recipe.source === 'photo' ? ' · from a photo' : recipe.source === 'youtube' ? ' · from YouTube' : ''}
        </T>
        {!!recipe.description && <T style={{ marginTop: Spacing.sm }}>{recipe.description}</T>}
      </View>

      <View style={styles.facts}>
        {!!recipe.total_minutes && <Fact icon="time-outline" label={`${recipe.total_minutes} min`} />}
        {!!recipe.servings && <Fact icon="people-outline" label={`Serves ${recipe.servings}`} />}
        {timesOnMenu > 0 && <Fact icon="flame-outline" label={`On the menu ${timesOnMenu}×`} />}
      </View>

      {recipe.dietary_tags.length > 0 && (
        <View style={styles.tags}>
          {recipe.dietary_tags.map((t) => (
            <Chip key={t} label={t} tone="success" />
          ))}
        </View>
      )}

      <Card style={styles.ratingCard}>
        <View style={styles.ratingRow}>
          <View style={{ gap: 4 }}>
            <T variant="label">Group rating</T>
            <View style={styles.inline}>
              <T variant="heading">{recipe.stats.rating_count ? recipe.stats.avg_score.toFixed(1) : '–'}</T>
              <Stars value={recipe.stats.avg_score} size={16} />
            </View>
            <T variant="small">
              {recipe.stats.rating_count === 0
                ? 'Be the first to rate it'
                : `${recipe.stats.rating_count} rating${recipe.stats.rating_count === 1 ? '' : 's'}`}
            </T>
          </View>
          <View style={{ gap: 6, alignItems: 'flex-end' }}>
            <T variant="label">Your rating</T>
            <Stars value={myScore ?? 0} size={28} onChange={rate} />
          </View>
        </View>
      </Card>

      <ErrorBanner message={error} />

      <View style={styles.actions}>
        {isAdmin ? (
          <Button
            title="Add to the weekly menu"
            icon="calendar-outline"
            variant="secondary"
            onPress={() => router.push({ pathname: '/menu-pick', params: { recipeId: recipe.id, people: String(cookingFor) } })}
            style={{ flex: 1 }}
          />
        ) : (
          <Button
            title={recipe.myVote ? `Voted for the menu · ${recipe.votes}` : `Vote for the menu${recipe.votes ? ` · ${recipe.votes}` : ''}`}
            icon={recipe.myVote ? 'thumbs-up' : 'thumbs-up-outline'}
            variant={recipe.myVote ? 'primary' : 'secondary'}
            onPress={toggleVote}
            loading={voting}
            style={{ flex: 1 }}
          />
        )}
        <Button title="I made this" icon="checkmark-done-outline" variant="secondary" onPress={openMadeIt} style={{ flex: 1 }} />
      </View>
      {isAdmin && recipe.votes > 0 && (
        <T variant="small" style={{ marginTop: Spacing.xs }}>
          {recipe.votes} member{recipe.votes === 1 ? '' : 's'} voted for this on the menu.
        </T>
      )}
      {doneMessage && <T variant="small" style={{ color: Colors.success, marginTop: Spacing.sm }}>{doneMessage}</T>}

      {madeIt && (
        <Card style={styles.madeIt}>
          <T variant="subheading">Nice! Update your pantry</T>
          <T variant="small">
            {usage.length
              ? `These are the pantry items this recipe used (for ${cookingFor}). Untick anything you didn't use.`
              : "None of this recipe's ingredients are in your pantry, so there's nothing to update."}
          </T>
          {usage.map((u, i) => (
            <Pressable
              key={u.pantryId}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: u.apply }}
              onPress={() => setUsage((prev) => prev.map((x, j) => (j === i ? { ...x, apply: !x.apply } : x)))}
              style={styles.usageRow}>
              <View style={[styles.checkbox, u.apply && styles.checkboxOn]}>
                {u.apply && <Icon name="checkmark" size={16} color={Colors.onPrimary} />}
              </View>
              <T style={{ flex: 1 }}>
                {u.after === null
                  ? `${u.before}: used it all up`
                  : `${u.before} → ${u.after > 0 ? formatIngredient({ name: u.name, quantity: u.after, unit: u.ingredient.unit }) : 'none left'}`}
              </T>
            </Pressable>
          ))}
          {!myScore && (
            <View style={styles.inline}>
              <T variant="small">How was it?</T>
              <Stars value={0} size={26} onChange={rate} />
            </View>
          )}
          <View style={styles.actions}>
            <Button title="Done" icon="checkmark" onPress={finishMadeIt} loading={saving} style={{ flex: 1 }} />
            <Button title="Cancel" variant="ghost" onPress={() => setMadeIt(false)} style={{ flex: 1 }} />
          </View>
        </Card>
      )}

      <Card style={styles.scaler}>
        <View style={styles.scalerRow}>
          <View style={{ flex: 1, gap: 2 }}>
            <T variant="subheading">Cooking for</T>
            <T variant="small">{recipe.servings ? `Recipe serves ${recipe.servings}` : "Recipe doesn't say how many it serves"}</T>
          </View>
          <Stepper value={cookingFor} onChange={setPeople} label="people" />
        </View>
        {!recipe.servings && (
          <View style={styles.scalerRow}>
            <T variant="small" style={{ flex: 1 }}>
              Best guess: one batch serves
            </T>
            <Stepper value={baseGuess} onChange={setBaseGuess} label="servings per batch" max={100} />
          </View>
        )}
        {factor !== 1 && (
          <View style={styles.scalerRow}>
            <Chip label={`${formatFactor(factor)} the recipe`} selected />
            <Pressable onPress={() => setPeople(null)} hitSlop={8} accessibilityRole="button">
              <T variant="small" style={styles.resetLink}>
                Reset to {base}
              </T>
            </Pressable>
          </View>
        )}
      </Card>
    </>
  );

  const ingredientsSection = (
    <>
      <SectionHeader
        title={`Ingredients · ${recipe.ingredients.length}${factor !== 1 ? ` · for ${cookingFor}` : ''}`}
        action={
          missing.length > 0 ? (
            <Chip label={`${missing.length} to buy`} tone="warning" icon="cart-outline" />
          ) : recipe.ingredients.length > 0 ? (
            <Chip label="All in your pantry" tone="success" icon="checkmark-circle" />
          ) : undefined
        }
      />
      <Card style={{ paddingVertical: Spacing.xs }}>
        {ingredients.map((ing, i) => {
          const have = pantryHas(pantry.names, ing.name);
          return (
            <View key={`${ing.name}-${i}`}>
              {i > 0 && <Divider />}
              <View style={styles.ingredient}>
                <Icon name={have ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={have ? Colors.success : Colors.warning} />
                <T style={{ flex: 1 }}>{formatIngredient(ing)}</T>
                <T variant="small" style={{ color: have ? Colors.success : Colors.warning }}>
                  {have ? 'Have' : 'Need'}
                </T>
              </View>
            </View>
          );
        })}
      </Card>
      {missing.length > 0 && (
        <Button
          title="I've got these now — add to my pantry"
          variant="ghost"
          icon="basket-outline"
          compact
          loading={adding}
          onPress={addMissingToPantry}
          style={{ alignSelf: 'flex-start', marginTop: Spacing.xs }}
        />
      )}
    </>
  );

  const stepsSection = (
    <>
      <SectionHeader title={`Steps · ${recipe.steps.length}`} />
      <View style={{ gap: Spacing.md }}>
        {recipe.steps.map((step, i) => (
          <View key={i} style={styles.step}>
            <View style={styles.stepNumber}>
              <T variant="small" style={styles.stepNumberText}>
                {i + 1}
              </T>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <T>{step}</T>
              {times && times[i] >= 0 && (
                <Pressable
                  onPress={() => Linking.openURL(youtubeAt(recipe.video_url!, times[i]))}
                  accessibilityRole="link"
                  accessibilityLabel={`Watch step ${i + 1} at ${formatTimestamp(times[i])}`}
                  style={styles.timestamp}>
                  <Icon name="play-circle" size={16} color={Colors.primaryStrong} />
                  <T variant="small" style={styles.timestampText}>
                    {formatTimestamp(times[i])}
                  </T>
                </Pressable>
              )}
            </View>
          </View>
        ))}
      </View>
    </>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: '',
          headerRight: canDelete
            ? () => (
                <IconButton
                  name="trash-outline"
                  label="Delete recipe"
                  color={Colors.danger}
                  onPress={() =>
                    confirm(
                      `Delete "${recipe.title}"?`,
                      'Are you sure? It will be removed for everyone in the community, including from weekly menus, ratings and votes. This cannot be undone.',
                      async () => {
                      try {
                        await deleteRecipe(recipe.id);
                        router.back();
                      } catch (e) {
                        setError(friendlyError(e));
                      }
                      },
                    )
                  }
                />
              )
            : undefined,
        }}
      />
      <ScrollView contentContainerStyle={[styles.content, { maxWidth: contentWidth }]}>
        {wide ? (
          <View style={styles.columns}>
            <View style={styles.column}>
              {hero}
              {info}
            </View>
            <View style={styles.column}>
              {ingredientsSection}
              {stepsSection}
            </View>
          </View>
        ) : (
          <>
            {hero}
            {info}
            {ingredientsSection}
            {stepsSection}
          </>
        )}
      </ScrollView>
    </>
  );
}

function Fact({ icon, label }: { icon: 'time-outline' | 'people-outline' | 'flame-outline'; label: string }) {
  return (
    <View style={styles.fact}>
      <Icon name={icon} size={16} color={Colors.primaryStrong} />
      <T variant="small" style={{ color: Colors.text }}>
        {label}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl * 2,
    width: '100%',
    alignSelf: 'center',
  },
  columns: { flexDirection: 'row', gap: Spacing.xxl, alignItems: 'flex-start' },
  column: { flex: 1, minWidth: 0 },
  hero: {
    aspectRatio: 16 / 10,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.primarySoft,
    marginBottom: Spacing.lg,
  },
  playOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  playButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(30,43,34,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 4,
  },
  titleBlock: { gap: 4 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.lg },
  fact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: Spacing.md },
  ratingCard: { marginTop: Spacing.lg, marginBottom: Spacing.md },
  ratingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.md, flexWrap: 'wrap' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md },
  madeIt: { gap: Spacing.md, marginTop: Spacing.md, borderColor: Colors.primary, borderWidth: 2 },
  usageRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 4 },
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
  scaler: { gap: Spacing.md, marginTop: Spacing.lg },
  scalerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  resetLink: { color: Colors.primaryStrong, fontWeight: '600' },
  ingredient: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
  step: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: { color: Colors.onPrimary, fontWeight: '700' },
  timestamp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: Colors.primarySoft,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  timestampText: { color: Colors.primaryStrong, fontWeight: '600' },
});
