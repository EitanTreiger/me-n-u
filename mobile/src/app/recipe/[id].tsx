import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Card, Chip, Divider, ErrorBanner, Icon, IconButton, Loading, SectionHeader, Stars, Stepper, T } from '@/components/ui';
import { Colors, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { deleteRecipe, getRecipe, rateRecipe } from '@/lib/api';
import { formatFactor, formatIngredient, pantryHas, scaleIngredients, servingFactor } from '@/lib/ingredients';
import { youtubeThumb } from '@/lib/ranking';
import { friendlyError, photoUrl } from '@/lib/supabase';
import type { RecipeWithStats } from '@/lib/types';
import { useAuth } from '@/providers/auth';
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
  const { session } = useAuth();
  const { isAdmin } = useGroups();
  const pantry = usePantry();
  const [recipe, setRecipe] = useState<RecipeWithStats | null>(null);
  const [myScore, setMyScore] = useState<number | null>(null);
  const [timesOnMenu, setTimesOnMenu] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // Serving scaler. `people` = how many we're cooking for; `baseGuess` is used
  // only when the recipe doesn't say how many it serves.
  const [people, setPeople] = useState<number | null>(null);
  const [baseGuess, setBaseGuess] = useState(4);

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

  const image = photoUrl(recipe.photo_path) ?? youtubeThumb(recipe.video_url);
  const base = recipe.servings ?? baseGuess;
  const cookingFor = people ?? base;
  const factor = servingFactor(base, cookingFor);
  const ingredients = scaleIngredients(recipe.ingredients, factor);
  const missing = ingredients.filter((i) => !pantryHas(pantry.names, i.name));
  const canDelete = recipe.author_id === session?.user.id || isAdmin;

  async function rate(score: number) {
    const previous = myScore;
    setMyScore(score);
    try {
      await rateRecipe(recipe!.id, score);
      const res = await getRecipe(recipe!.id);
      setRecipe(res.recipe);
    } catch (e) {
      setMyScore(previous);
      setError(friendlyError(e));
    }
  }

  async function addMissingToPantry() {
    setAdding(true);
    try {
      await pantry.add(missing.map((m) => m.name));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setAdding(false);
    }
  }

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
                    confirm('Delete this recipe?', 'It will be removed for everyone in the group, including from menus.', async () => {
                      try {
                        await deleteRecipe(recipe.id);
                        router.back();
                      } catch (e) {
                        setError(friendlyError(e));
                      }
                    })
                  }
                />
              )
            : undefined,
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {image && (
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
        )}

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

        {isAdmin && (
          <Button
            title="Add to the weekly menu"
            icon="calendar-outline"
            variant="secondary"
            onPress={() =>
              router.push({ pathname: '/menu-pick', params: { recipeId: recipe.id, people: String(cookingFor) } })
            }
            style={{ marginTop: Spacing.md }}
          />
        )}

        <Card style={styles.scaler}>
          <View style={styles.scalerRow}>
            <View style={{ flex: 1, gap: 2 }}>
              <T variant="subheading">Cooking for</T>
              <T variant="small">
                {recipe.servings
                  ? `Recipe serves ${recipe.servings}`
                  : "Recipe doesn't say how many it serves"}
              </T>
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
                  <Icon
                    name={have ? 'checkmark-circle' : 'ellipse-outline'}
                    size={20}
                    color={have ? Colors.success : Colors.warning}
                  />
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

        <SectionHeader title={`Steps · ${recipe.steps.length}`} />
        <View style={{ gap: Spacing.md }}>
          {recipe.steps.map((step, i) => (
            <View key={i} style={styles.step}>
              <View style={styles.stepNumber}>
                <T variant="small" style={styles.stepNumberText}>
                  {i + 1}
                </T>
              </View>
              <T style={{ flex: 1 }}>{step}</T>
            </View>
          ))}
        </View>
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
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
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
});
