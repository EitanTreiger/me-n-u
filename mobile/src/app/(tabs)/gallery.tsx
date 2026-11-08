import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Button, Card, EmptyState, ErrorBanner, Loading, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useLayout } from '@/hooks/use-layout';
import { galleryCredit, listAllGallery, type GalleryFeedPhoto } from '@/lib/api';
import { friendlyError, photoUrl } from '@/lib/supabase';
import { makeStyles } from '@/providers/appearance';

const PAGE_SIZE = 30;

/**
 * Every photo people have posted of meals they made, from every recipe and
 * every home, newest first. Tap a photo to open its recipe, where the same
 * photo sits in the recipe's gallery.
 */
export default function GalleryTab() {
  const styles = useStyles();
  const { wide } = useLayout();
  const [photos, setPhotos] = useState<GalleryFeedPhoto[] | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // First page; also reloads when you come back to the tab, so new photos show.
  const loadFirst = useCallback(async () => {
    try {
      const rows = await listAllGallery(0, PAGE_SIZE);
      setPhotos(rows);
      setPage(0);
      setHasMore(rows.length === PAGE_SIZE);
      setError(null);
    } catch (e) {
      setError(friendlyError(e));
      setPhotos((prev) => prev ?? []);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadFirst();
    }, [loadFirst]),
  );

  async function loadMore() {
    setLoadingMore(true);
    try {
      const rows = await listAllGallery(page + 1, PAGE_SIZE);
      setPhotos((prev) => [...(prev ?? []), ...rows.filter((r) => !prev?.some((p) => p.id === r.id))]);
      setPage(page + 1);
      setHasMore(rows.length === PAGE_SIZE);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoadingMore(false);
    }
  }

  const columns = wide ? 4 : 2;

  return (
    <Screen
      title="Gallery"
      subtitle="Meals people have made, from every home. Tap a photo to see the recipe."
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await loadFirst();
        setRefreshing(false);
      }}>
      <ErrorBanner message={error} />

      {photos === null ? (
        <Loading />
      ) : photos.length === 0 ? (
        <Card>
          <EmptyState
            icon="images-outline"
            title="No photos yet"
            body="Made a recipe? Open it on the Recipes tab and add a photo at the bottom. It'll show up here too."
            action={<Button title="Go to recipes" onPress={() => router.navigate('/')} />}
          />
        </Card>
      ) : (
        <>
          <View style={styles.grid}>
            {photos.map((p) => (
              <Pressable
                key={p.id}
                disabled={!p.recipe}
                onPress={() => p.recipe && router.push({ pathname: '/recipe/[id]', params: { id: p.recipe.id } })}
                accessibilityRole="button"
                accessibilityLabel={`${p.recipe?.title ?? 'Recipe'}, ${galleryCredit(p)}. Open recipe`}
                style={({ pressed }) => [styles.tile, { width: `${100 / columns}%` }, pressed && { opacity: 0.8 }]}>
                <View style={styles.card}>
                  <Image source={{ uri: photoUrl(p.photo_path)! }} style={styles.image} contentFit="cover" transition={150} />
                  <View style={styles.caption}>
                    <T style={styles.title} numberOfLines={1}>
                      {p.recipe?.title ?? 'Recipe removed'}
                    </T>
                    <T variant="small" numberOfLines={1}>
                      {galleryCredit(p)}
                    </T>
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
          {hasMore && (
            <Button
              title="Show more"
              variant="secondary"
              onPress={loadMore}
              loading={loadingMore}
              style={{ alignSelf: 'center', marginTop: Spacing.md }}
            />
          )}
        </>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((Colors) => ({
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -Spacing.xs },
  tile: { padding: Spacing.xs },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  image: { width: '100%', aspectRatio: 1, backgroundColor: Colors.primarySoft },
  caption: { paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm, gap: 1 },
  title: { fontSize: 14, fontWeight: '600' },
}));
