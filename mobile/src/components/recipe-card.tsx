import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { missingIngredients } from '@/lib/ingredients';
import { youtubeThumb } from '@/lib/ranking';
import { photoUrl } from '@/lib/supabase';
import type { RecipeWithStats } from '@/lib/types';

import { Card, Chip, Icon, Stars, T } from './ui';

export function RecipeThumb({ recipe, size = 84 }: { recipe: Pick<RecipeWithStats, 'photo_path' | 'video_url' | 'image_url'>; size?: number }) {
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

export function RecipeCard({
  recipe,
  pantry,
  rank,
  onPress,
}: {
  recipe: RecipeWithStats;
  pantry: string[];
  rank?: number;
  onPress: () => void;
}) {
  const missing = missingIngredients(pantry, recipe.ingredients);
  const total = recipe.ingredients.length;
  const ready = total > 0 && missing.length === 0;

  return (
    <Card onPress={onPress} style={styles.card}>
      <RecipeThumb recipe={recipe} />
      <View style={styles.body}>
        <View style={styles.titleRow}>
          {rank !== undefined && (
            <View style={[styles.rank, rank <= 3 && styles.rankTop]}>
              <T variant="small" style={[styles.rankText, rank <= 3 && { color: Colors.onPrimary }]}>
                {rank}
              </T>
            </View>
          )}
          <T variant="subheading" numberOfLines={2} style={{ flex: 1 }}>
            {recipe.title}
          </T>
        </View>

        <View style={styles.metaRow}>
          {recipe.stats.rating_count > 0 ? (
            <>
              <Stars value={recipe.stats.avg_score} size={13} />
              <T variant="small">
                {recipe.stats.avg_score.toFixed(1)} ({recipe.stats.rating_count})
              </T>
            </>
          ) : (
            <T variant="small">No ratings yet</T>
          )}
          {!!recipe.total_minutes && (
            <T variant="small" style={{ color: Colors.textMuted }}>
              · {recipe.total_minutes} min
            </T>
          )}
        </View>

        {total > 0 && (
          <View style={styles.chips}>
            {ready ? (
              <Chip label="You have everything" tone="success" icon="checkmark-circle" />
            ) : (
              <Chip
                label={`Need ${missing.length} of ${total}: ${missing
                  .slice(0, 2)
                  .map((m) => m.name)
                  .join(', ')}${missing.length > 2 ? '…' : ''}`}
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

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: Spacing.md, padding: Spacing.md },
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
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  rank: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 6,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -1,
  },
  rankTop: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  rankText: { fontWeight: '700', color: Colors.textSecondary, lineHeight: 16 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
