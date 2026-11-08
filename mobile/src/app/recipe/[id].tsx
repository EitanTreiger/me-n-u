import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RecipeGallery } from '@/components/recipe-gallery';
import { Button, Card, Chip, Divider, ErrorBanner, Icon, Loading, SectionHeader, Stars, Stepper, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { makeStyles, useColors } from '@/providers/appearance';
import { useLayout } from '@/hooks/use-layout';
import { deleteRecipe, getRecipe, rateRecipe, setMenuVote } from '@/lib/api';
import {
  formatFactor,
  formatIngredient,
  scaleIngredients,
  servingFactor,
} from '@/lib/ingredients';
import { youtubeThumb } from '@/lib/ranking';
import { friendlyError, photoUrl } from '@/lib/supabase';
import type { RecipeWithStats } from '@/lib/types';
import { formatTimestamp, youtubeAt } from '@/lib/youtube';
import { useGroups } from '@/providers/groups';

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
  const Colors = useColors();
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isAdmin, isAnyAdmin, activeHome } = useGroups();
  // Menu votes are per home; recipes and ratings are shared by every home.
  const homeId = activeHome?.id;
  const { wide, contentWidth } = useLayout();
  const [recipe, setRecipe] = useState<RecipeWithStats | null>(null);
  const [myScore, setMyScore] = useState<number | null>(null);
  const [timesOnMenu, setTimesOnMenu] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  // Serving scaler. `people` = how many we're cooking for; `baseGuess` is used
  // only when the recipe doesn't say how many it serves.
  const [people, setPeople] = useState<number | null>(null);
  const [baseGuess, setBaseGuess] = useState(4);

  useEffect(() => {
    let alive = true;
    getRecipe(id, homeId)
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
  }, [id, homeId]);

  if (error && !recipe) {
    return (
      <SafeAreaView edges={['top']} style={styles.safe}>
        <TopButtons />
        <View style={{ padding: Spacing.lg }}>
          <ErrorBanner message={error} />
        </View>
      </SafeAreaView>
    );
  }
  if (!recipe) {
    return (
      <SafeAreaView edges={['top']} style={styles.safe}>
        <TopButtons />
        <Loading />
      </SafeAreaView>
    );
  }

  const image = photoUrl(recipe.photo_path) ?? recipe.image_url ?? youtubeThumb(recipe.video_url);
  const base = recipe.servings ?? baseGuess;
  const cookingFor = people ?? base;
  const factor = servingFactor(base, cookingFor);
  const ingredients = scaleIngredients(recipe.ingredients, factor);
  // Recipes are shared by every home: admins (of any home) can delete them; members can't.
  const canDelete = isAnyAdmin;
  const times = recipe.video_url && recipe.step_timestamps?.length === recipe.steps.length ? recipe.step_timestamps : null;

  async function refreshRecipe() {
    const res = await getRecipe(recipe!.id, homeId);
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
    if (!homeId) return;
    setVoting(true);
    try {
      await setMenuVote(recipe!.id, homeId, !recipe!.myVote);
      await refreshRecipe();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setVoting(false);
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
          {recipe.source === 'photo' ? 'From a photo' : recipe.source === 'youtube' ? 'From YouTube' : 'Shared recipe'}
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
            title={recipe.myVote ? 'Voted for the menu' : 'Vote for the menu'}
            icon={recipe.myVote ? 'thumbs-up' : 'thumbs-up-outline'}
            variant={recipe.myVote ? 'primary' : 'secondary'}
            onPress={toggleVote}
            loading={voting}
            disabled={!homeId}
            style={{ flex: 1 }}
          />
        )}
      </View>
      {/* Votes are counted per home; admins see the home they're viewing. */}
      {activeHome && (isAdmin ? recipe.votes > 0 : true) && (
        <T variant="small" style={{ marginTop: Spacing.xs }}>
          {isAdmin
            ? `${recipe.votes} ${recipe.votes === 1 ? 'person' : 'people'} at ${activeHome.name} voted for this on the menu this week.`
            : `Your vote counts toward ${activeHome.name}'s menu.`}
        </T>
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
      />
      <Card style={{ paddingVertical: Spacing.xs }}>
        {ingredients.map((ing, i) => (
          <View key={`${ing.name}-${i}`}>
            {i > 0 && <Divider />}
            <View style={styles.ingredient}>
              <Icon name="ellipse" size={8} color={Colors.textMuted} />
              <T style={{ flex: 1 }}>{formatIngredient(ing)}</T>
            </View>
          </View>
        ))}
      </Card>
    </>
  );

  const stepsSection = (
    <>
      <SectionHeader title={`Steps · ${recipe.steps.length}`} />
      {recipe.steps.length > 0 && (
        <Button
          title="Listen to recipe"
          icon="headset-outline"
          variant="secondary"
          compact
          onPress={() => router.push({ pathname: '/recipe/listen/[id]', params: { id: recipe.id } })}
          style={{ alignSelf: 'flex-start', marginBottom: Spacing.md }}
        />
      )}
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
    <SafeAreaView edges={['top']} style={styles.safe}>
      <ScrollView contentContainerStyle={[styles.content, { maxWidth: contentWidth }]}>
        <TopButtons
          onDelete={
            // Only admins delete recipes (the database enforces this too).
            canDelete
              ? () =>
                  confirm(
                    `Delete "${recipe.title}"?`,
                    'Are you sure? It will be removed for everyone in every home, including from weekly menus, ratings, votes and its gallery. This cannot be undone.',
                    async () => {
                      try {
                        await deleteRecipe(recipe.id);
                        goBack();
                      } catch (e) {
                        setError(friendlyError(e));
                      }
                    },
                  )
              : undefined
          }
        />
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
        <RecipeGallery recipeId={recipe.id} />
      </ScrollView>
    </SafeAreaView>
  );
}

/** Back to the previous page, or to Recipes when the recipe was opened directly. */
function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** Round Back (and, for admins, Delete) buttons at the top of the recipe, in place of a header bar. */
function TopButtons({ onDelete }: { onDelete?: () => void }) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.topButtons}>
      <Pressable
        onPress={goBack}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={6}
        style={({ pressed }) => [styles.roundButton, pressed && { opacity: 0.6 }]}>
        <Icon name="chevron-back" size={22} color={Colors.text} />
      </Pressable>
      {onDelete && (
        <Pressable
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel="Delete recipe"
          hitSlop={6}
          style={({ pressed }) => [styles.roundButton, pressed && { opacity: 0.6 }]}>
          <Icon name="trash-outline" size={20} color={Colors.danger} />
        </Pressable>
      )}
    </View>
  );
}

function Fact({ icon, label }: { icon: 'time-outline' | 'people-outline' | 'flame-outline'; label: string }) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.fact}>
      <Icon name={icon} size={16} color={Colors.primaryStrong} />
      <T variant="small" style={{ color: Colors.text }}>
        {label}
      </T>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  safe: { flex: 1, backgroundColor: Colors.background },
  topButtons: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: Spacing.md },
  roundButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
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
}));
