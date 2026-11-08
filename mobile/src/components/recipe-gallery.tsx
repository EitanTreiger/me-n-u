import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Platform, Pressable, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useLayout } from '@/hooks/use-layout';
import { addGalleryPhoto, deleteGalleryPhoto, galleryCredit, listGallery, type GalleryPhoto } from '@/lib/api';
import { friendlyError, photoUrl } from '@/lib/supabase';
import { makeStyles, useColors } from '@/providers/appearance';
import { useAuth } from '@/providers/auth';
import { useGroups } from '@/providers/groups';

import { Button, Card, ErrorBanner, IconButton, Loading, SectionHeader, T } from './ui';

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Photos people took when they made this recipe. Everyone can add one, and
 * every home sees all of them. You can delete your own.
 */
export function RecipeGallery({ recipeId }: { recipeId: string }) {
  const Colors = useColors();
  const styles = useStyles();
  const userId = useAuth().session?.user.id;
  const { activeHome } = useGroups();
  const { wide } = useLayout();
  const [photos, setPhotos] = useState<GalleryPhoto[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<GalleryPhoto | null>(null);

  const load = useCallback(async () => {
    try {
      setPhotos(await listGallery(recipeId));
    } catch (e) {
      setError(friendlyError(e));
      setPhotos([]);
    }
  }, [recipeId]);

  useEffect(() => {
    let alive = true;
    listGallery(recipeId)
      .then((rows) => alive && setPhotos(rows))
      .catch((e) => {
        if (!alive) return;
        setError(friendlyError(e));
        setPhotos([]);
      });
    return () => {
      alive = false;
    };
  }, [recipeId]);

  async function add(fromCamera: boolean) {
    setError(null);
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return setError(fromCamera ? 'Allow camera access to take a photo.' : 'Allow photo access to add a picture.');
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7 };
    const result = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    setUploading(true);
    try {
      await addGalleryPhoto(recipeId, activeHome?.id ?? null, asset.uri, asset.mimeType ?? 'image/jpeg');
      await load();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setUploading(false);
    }
  }

  async function remove(photo: GalleryPhoto) {
    setViewing(null);
    setPhotos((prev) => prev?.filter((p) => p.id !== photo.id) ?? null);
    try {
      await deleteGalleryPhoto(photo);
    } catch (e) {
      setError(friendlyError(e));
      load();
    }
  }

  const columns = wide ? 4 : 3;

  return (
    <View style={styles.section}>
      <SectionHeader title={`Gallery${photos?.length ? ` · ${photos.length}` : ''}`} />
      <Card style={{ gap: Spacing.md }}>
        <T variant="small">Made this? Add a photo of how yours turned out. It also shows on the Gallery tab for every home.</T>
        <View style={styles.actions}>
          {/* Phones can take a photo straight away; computers pick a file. */}
          {Platform.OS !== 'web' && (
            <Button title="Take photo" icon="camera-outline" compact onPress={() => add(true)} loading={uploading} />
          )}
          <Button
            title={Platform.OS === 'web' ? 'Add photo' : 'Choose photo'}
            icon="images-outline"
            compact
            variant={Platform.OS === 'web' ? 'primary' : 'secondary'}
            onPress={() => add(false)}
            loading={Platform.OS === 'web' && uploading}
            disabled={uploading}
          />
        </View>
        <ErrorBanner message={error} />

        {photos === null ? (
          <Loading />
        ) : photos.length === 0 ? (
          <T variant="small" style={{ color: Colors.textMuted }}>
            No photos yet. Be the first!
          </T>
        ) : (
          <View style={styles.grid}>
            {photos.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => setViewing(p)}
                accessibilityRole="imagebutton"
                accessibilityLabel={`Photo, ${galleryCredit(p)}`}
                style={({ pressed }) => [styles.tile, { width: `${100 / columns}%` }, pressed && { opacity: 0.8 }]}>
                <Image source={{ uri: photoUrl(p.photo_path)! }} style={styles.tileImage} contentFit="cover" transition={150} />
              </Pressable>
            ))}
          </View>
        )}
      </Card>

      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <Pressable style={styles.backdrop} onPress={() => setViewing(null)} accessibilityLabel="Close photo">
          {viewing && (
            <View style={styles.viewer} onStartShouldSetResponder={() => true}>
              <Image source={{ uri: photoUrl(viewing.photo_path)! }} style={styles.viewerImage} contentFit="contain" />
              <View style={styles.viewerBar}>
                <View style={{ flex: 1 }}>
                  <T style={{ fontWeight: '600' }}>{galleryCredit(viewing)}</T>
                  <T variant="small">{shortDate(viewing.created_at)}</T>
                </View>
                {viewing.user_id === userId && (
                  <IconButton name="trash-outline" color={Colors.danger} label="Delete your photo" onPress={() => remove(viewing)} />
                )}
                <IconButton name="close" label="Close" onPress={() => setViewing(null)} />
              </View>
            </View>
          )}
        </Pressable>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  section: { marginTop: Spacing.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3 },
  tile: { aspectRatio: 1, padding: 3 },
  tileImage: { flex: 1, borderRadius: Radius.sm, backgroundColor: Colors.primarySoft },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', padding: Spacing.lg },
  viewer: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  viewerImage: { width: '100%', aspectRatio: 1, backgroundColor: Colors.background },
  viewerBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md },
}));
