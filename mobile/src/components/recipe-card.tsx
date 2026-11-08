import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { makeStyles, useColors } from '@/providers/appearance';
import { missingIngredients } from '@/lib/ingredients';
import { youtubeThumb } from '@/lib/ranking';
import { photoUrl } from '@/lib/supabase';
import type { RecipeWithStats } from '@/lib/types';

import { Card, Chip, Icon, T } from './ui';

export function RecipeThumb({ recipe, size = 84 }: { recipe: Pick<RecipeWithStats, 'photo_path' | 'video_url' | 'image_url'>; size?: number }) {
  const Colors = useColors();
  const styles = useStyles();
  const uri = photoUrl(recipe.photo_path) ?? recipe.image_url ?? youtubeThumb(recipe.video_url);
  return (
    <View style={[styles.thumb, { width: size, height: size }]}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      ) : (
        <Icon name="restaurant-outline" size={size * 0.34} color={Colors.primaryStrong} />
      )}
      {recipe.video_url && (
        <View style={styles.playBadge}>
          <Icon name="play" size={12} color="#FFFFFF" />
        </View>
      )}
    </View>
  );
}

/** "Rich meat sauce over spaghetti. (Italian)" -> "Italian" */
export function recipeCuisine(description: string): string | null {
  return description.match(/\(([^()]+)\)\s*$/)?.[1] ?? null;
}

/** Description without the trailing "(Cuisine)". */
function cleanDescription(description: string): string {
  return description.replace(/\s*\([^()]+\)\s*$/, '');
}

/** Well liked by the group: an average of 4 stars or more. */
export function isFavourite(recipe: RecipeWithStats): boolean {
  return recipe.stats.rating_count > 0 && recipe.stats.avg_score >= 4;
}

export function RecipeCard({
  recipe,
  pantry,
  onPress,
  large = false,
  showVotes = false,
}: {
  recipe: RecipeWithStats;
  /** The home's pantry, to show what's missing. Admins only (members can't see the pantry). */
  pantry?: string[] | null;
  onPress: () => void;
  /** Bigger photo and text, for computers. */
  large?: boolean;
  /** This week's menu votes at the home; only that home's admins see them. */
  showVotes?: boolean;
}) {
  const Colors = useColors();
  const styles = useStyles();
  const missing = pantry ? missingIngredients(pantry, recipe.ingredients) : [];
  const total = recipe.ingredients.length;
  const ready = total > 0 && missing.length === 0;
  const cuisine = recipeCuisine(recipe.description);
  const metaText = large ? styles.metaLarge : undefined;

  return (
    <Card onPress={onPress} style={[styles.card, large && styles.cardLarge]}>
      <RecipeThumb recipe={recipe} size={large ? 150 : 84} />
      <View style={[styles.body, large && { gap: 10 }]}>
        <View style={styles.titleRow}>
          <T variant="subheading" numberOfLines={2} style={[{ flexShrink: 1 }, large && styles.titleLarge]}>
            {recipe.title}
          </T>
          {isFavourite(recipe) && (
            <View accessibilityLabel={`Rated ${recipe.stats.avg_score.toFixed(1)} stars`} style={styles.star}>
              <Icon name="star" size={large ? 20 : 16} color={Colors.star} />
            </View>
          )}
        </View>

        {large && !!recipe.description && (
          <T variant="small" numberOfLines={2} style={styles.descriptionLarge}>
            {cleanDescription(recipe.description)}
          </T>
        )}

        <View style={styles.metaRow}>
          {cuisine && (
            <T variant="small" style={metaText}>
              {cuisine}
            </T>
          )}
          {!!recipe.total_minutes && (
            <View style={styles.meta}>
              <Icon name="time-outline" size={large ? 16 : 13} color={Colors.textMuted} />
              <T variant="small" style={metaText}>
                {recipe.total_minutes} min
              </T>
            </View>
          )}
          {showVotes && recipe.votes > 0 && (
            <View style={styles.meta}>
              <Icon name={recipe.myVote ? 'thumbs-up' : 'thumbs-up-outline'} size={large ? 15 : 12} color={Colors.primaryStrong} />
              <T variant="small" style={[{ color: Colors.primaryStrong, fontWeight: '600' }, metaText]}>
                {recipe.votes}
              </T>
            </View>
          )}
        </View>

        {!!pantry && total > 0 && (
          <View style={styles.chips}>
            {ready ? (
              <Chip label="You have everything" tone="success" icon="checkmark-circle" />
            ) : (
              <Chip
                label={`Need ${missing.length} of ${total}: ${missing
                  .slice(0, large ? 4 : 2)
                  .map((m) => m.name)
                  .join(', ')}${missing.length > (large ? 4 : 2) ? '…' : ''}`}
                tone="warning"
                icon="cart-outline"
              />
            )}
          </View>
        )}
      </View>
    </Card>
  );
}

const useStyles = makeStyles((Colors) => ({
  card: { flexDirection: 'row', gap: Spacing.md, padding: Spacing.md },
  cardLarge: { gap: Spacing.xl, padding: Spacing.lg, borderRadius: Radius.lg },
  thumb: {
    borderRadius: Radius.md,
    backgroundColor: Colors.primarySoft,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(30,43,34,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 6, justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  titleLarge: { fontSize: 22, lineHeight: 28, letterSpacing: -0.2 },
  star: { marginTop: 1 },
  descriptionLarge: { fontSize: 15, lineHeight: 21 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flexWrap: 'wrap' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaLarge: { fontSize: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
}));
