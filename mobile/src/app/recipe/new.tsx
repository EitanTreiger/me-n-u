import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Card, Chip, ErrorBanner, Field, Icon, IconButton, T, type IconName } from '@/components/ui';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { makeStyles, useColors } from '@/providers/appearance';
import { attachRecipeImage, convertPhoto, convertText, convertYoutube, createRecipe, uploadPhoto } from '@/lib/api';
import { formatIngredient, parseIngredientLine } from '@/lib/ingredients';
import { youtubeId, youtubeThumb } from '@/lib/ranking';
import { friendlyError } from '@/lib/supabase';
import { DIETARY_TAGS, type ConvertedRecipe, type Ingredient, type RecipeSource } from '@/lib/types';
import { useGroups } from '@/providers/groups';

type Mode = 'manual' | 'paste' | 'photo' | 'youtube';

const MODES: { key: Mode; label: string; icon: IconName; hint: string }[] = [
  { key: 'manual', label: 'Type', icon: 'create-outline', hint: 'Write the recipe yourself.' },
  {
    key: 'paste',
    label: 'Paste',
    icon: 'clipboard-outline',
    hint: 'Paste a whole recipe from a website, email or document and we will sort it into ingredients and steps.',
  },
  { key: 'photo', label: 'Photo', icon: 'camera-outline', hint: 'Snap a recipe card, cookbook page or handwritten note and we will turn it into text.' },
  { key: 'youtube', label: 'YouTube', icon: 'logo-youtube', hint: 'Paste a cooking video link and we will write out the recipe from it.' },
];

type Photo = { uri: string; base64: string | null; mimeType: string };

export default function NewRecipe() {
  const Colors = useColors();
  const styles = useStyles();
  const { active } = useGroups();
  const [mode, setMode] = useState<Mode>('manual');
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [pasted, setPasted] = useState('');
  const [converting, setConverting] = useState(false);
  const [converted, setConverted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [servings, setServings] = useState('');
  const [minutes, setMinutes] = useState('');
  const [ingredientsText, setIngredientsText] = useState('');
  const [stepsText, setStepsText] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  // Seconds into the video for each converted step (YouTube only).
  const [stepTimes, setStepTimes] = useState<number[] | null>(null);

  const ingredients: Ingredient[] = ingredientsText
    .split('\n')
    .map(parseIngredientLine)
    .filter((i): i is Ingredient => i !== null);
  const steps = stepsText
    .split('\n')
    .map((s) => s.replace(/^\s*(\d+[.)]|[-*•])\s*/, '').trim())
    .filter(Boolean);

  const showForm = mode === 'manual' || converted;
  const canSave = title.trim().length > 0 && ingredients.length > 0 && steps.length > 0 && !saving;

  function fill(r: ConvertedRecipe) {
    setTitle(r.title);
    setDescription(r.description);
    setServings(r.servings ? String(r.servings) : '');
    setMinutes(r.total_minutes ? String(r.total_minutes) : '');
    setIngredientsText(r.ingredients.map(formatIngredient).join('\n'));
    setStepsText(r.steps.join('\n'));
    setTags(r.dietary_tags.filter((t) => (DIETARY_TAGS as readonly string[]).includes(t)));
    setStepTimes(r.step_times?.length === r.steps.length && r.step_times.some((t) => t >= 0) ? r.step_times : null);
    setConverted(true);
  }

  async function pick(fromCamera: boolean) {
    setError(null);
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError(fromCamera ? 'Camera access is needed to take a photo.' : 'Photo library access is needed to choose a photo.');
      return null;
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6, base64: true, allowsEditing: false };
    const result = fromCamera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || !result.assets[0]) return null;
    const a = result.assets[0];
    const p = { uri: a.uri, base64: a.base64 ?? null, mimeType: a.mimeType ?? 'image/jpeg' };
    setPhoto(p);
    return p;
  }

  async function pickAndConvert(fromCamera: boolean) {
    const p = await pick(fromCamera);
    if (!p) return;
    if (!p.base64) {
      setError("Couldn't read that photo. Try another one.");
      return;
    }
    setConverting(true);
    try {
      fill(await convertPhoto(p.base64, p.mimeType));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setConverting(false);
    }
  }

  async function convertPasted() {
    setError(null);
    setConverting(true);
    try {
      fill(await convertText(pasted.trim()));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setConverting(false);
    }
  }

  async function convertVideo() {
    setError(null);
    if (!youtubeId(videoUrl)) {
      setError("That doesn't look like a YouTube link.");
      return;
    }
    setConverting(true);
    try {
      fill(await convertYoutube(videoUrl.trim()));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setConverting(false);
    }
  }

  async function save() {
    if (!active) return;
    setSaving(true);
    setError(null);
    try {
      const photo_path = photo ? await uploadPhoto(active.id, photo.uri, photo.mimeType) : null;
      // No photo of our own (and no video thumbnail): find a picture online, but don't wait more than 5 s.
      const needsImage = !photo_path && mode !== 'youtube';
      const source: RecipeSource = mode === 'photo' || mode === 'youtube' ? mode : 'manual';
      const id = await createRecipe({
        group_id: active.id,
        title: title.trim(),
        description: description.trim(),
        servings: Number(servings) > 0 ? Math.round(Number(servings)) : null,
        total_minutes: Number(minutes) > 0 ? Math.round(Number(minutes)) : null,
        ingredients,
        steps,
        dietary_tags: tags,
        photo_path,
        video_url: mode === 'youtube' && videoUrl.trim() ? videoUrl.trim() : null,
        // Keep timestamps only if the steps weren't added to or removed while editing.
        step_timestamps: mode === 'youtube' && stepTimes && stepTimes.length === steps.length ? stepTimes : null,
        source,
      });
      // No photo of our own: Gemini picks one online in the background.
      if (needsImage) attachRecipeImage(id, title.trim(), description.trim());
      router.replace({ pathname: '/recipe/[id]', params: { id } });
    } catch (e) {
      setError(friendlyError(e));
      setSaving(false);
    }
  }

  const thumb = mode === 'youtube' ? youtubeThumb(videoUrl) : null;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.segment}>
          {MODES.map((m) => {
            const selected = mode === m.key;
            return (
              <Pressable
                key={m.key}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => {
                  setMode(m.key);
                  setError(null);
                }}
                style={[styles.segmentItem, selected && styles.segmentSelected]}>
                <Icon name={m.icon} size={16} color={selected ? Colors.onPrimary : Colors.textSecondary} />
                <T variant="small" style={[styles.segmentText, selected && { color: Colors.onPrimary }]}>
                  {m.label}
                </T>
              </Pressable>
            );
          })}
        </View>
        <T variant="small" style={{ marginBottom: Spacing.lg }}>
          {MODES.find((m) => m.key === mode)!.hint}
        </T>

        {mode === 'photo' && (
          <Card style={styles.sourceCard}>
            {photo ? (
              <View style={styles.preview}>
                <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
              </View>
            ) : (
              <View style={[styles.preview, styles.previewEmpty]}>
                <Icon name="image-outline" size={36} color={Colors.primaryStrong} />
              </View>
            )}
            <View style={styles.row}>
              <Button title="Take photo" icon="camera-outline" onPress={() => pickAndConvert(true)} style={styles.flex} disabled={converting} />
              <Button
                title="Library"
                icon="images-outline"
                variant="secondary"
                onPress={() => pickAndConvert(false)}
                style={styles.flex}
                disabled={converting}
              />
            </View>
          </Card>
        )}

        {mode === 'paste' && (
          <Card style={styles.sourceCard}>
            <Field
              label="Recipe text"
              value={pasted}
              onChangeText={(v) => {
                setPasted(v);
                setConverted(false);
              }}
              placeholder={'Paste everything here: title, ingredients and instructions.\nExtra text from the website is fine.'}
              multiline
              style={{ minHeight: 220 }}
            />
            <Button
              title="Format recipe"
              icon="sparkles-outline"
              onPress={convertPasted}
              loading={converting}
              disabled={pasted.trim().length < 20}
            />
          </Card>
        )}

        {mode === 'youtube' && (
          <Card style={styles.sourceCard}>
            {thumb && (
              <View style={styles.preview}>
                <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} contentFit="cover" />
              </View>
            )}
            <Field
              label="YouTube link"
              value={videoUrl}
              onChangeText={(v) => {
                setVideoUrl(v);
                setConverted(false);
              }}
              placeholder="https://www.youtube.com/watch?v=…"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <Button title="Convert to recipe" icon="sparkles-outline" onPress={convertVideo} loading={converting} disabled={!videoUrl.trim()} />
          </Card>
        )}

        {converting && (
          <View style={styles.converting}>
            <Icon name="sparkles" size={18} color={Colors.primaryStrong} />
            <T variant="small" style={{ flex: 1, color: Colors.text }}>
              Reading the {mode === 'photo' ? 'photo' : mode === 'paste' ? 'text' : 'video'} and writing out the recipe. This
              takes a few seconds…
            </T>
          </View>
        )}

        <ErrorBanner message={error} />

        {converted && (
          <View style={styles.convertedNote}>
            <Icon name="checkmark-circle" size={18} color={Colors.success} />
            <T variant="small" style={{ flex: 1, color: Colors.text }}>
              Converted. Check it over and fix anything that looks off before saving.
            </T>
          </View>
        )}

        {showForm && (
          <View style={styles.form}>
            <Field label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Sheet-pan chicken and veg" />
            <Field
              label="Description"
              value={description}
              onChangeText={setDescription}
              placeholder="What makes it good? Who loves it?"
              multiline
            />
            <View style={styles.row}>
              <View style={styles.flex}>
                <Field label="Serves" value={servings} onChangeText={setServings} placeholder="4" keyboardType="number-pad" />
              </View>
              <View style={styles.flex}>
                <Field label="Minutes" value={minutes} onChangeText={setMinutes} placeholder="30" keyboardType="number-pad" />
              </View>
            </View>
            <Field
              label="Ingredients"
              hint="One per line, like “2 cups rice” or “1 onion”."
              value={ingredientsText}
              onChangeText={setIngredientsText}
              placeholder={'2 cups rice\n1 onion\n2 tbsp olive oil'}
              multiline
              style={{ minHeight: 140 }}
            />
            <Field
              label="Steps"
              hint="One step per line."
              value={stepsText}
              onChangeText={setStepsText}
              placeholder={'Rinse the rice.\nSoften the onion in oil.\nAdd rice and water, simmer 15 minutes.'}
              multiline
              style={{ minHeight: 140 }}
            />

            <View style={{ gap: Spacing.sm }}>
              <T variant="label">Dietary tags</T>
              <View style={styles.tags}>
                {DIETARY_TAGS.map((t) => (
                  <Chip
                    key={t}
                    label={t}
                    selected={tags.includes(t)}
                    onPress={() => setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))}
                  />
                ))}
              </View>
            </View>

            {mode !== 'photo' && (
              <View style={{ gap: Spacing.sm }}>
                <T variant="label">Photo</T>
                {photo ? (
                  <View style={styles.photoRow}>
                    <Image source={{ uri: photo.uri }} style={styles.smallPhoto} contentFit="cover" />
                    <T variant="small" style={{ flex: 1 }}>
                      Photo added
                    </T>
                    <IconButton name="close-circle" label="Remove photo" color={Colors.textMuted} onPress={() => setPhoto(null)} />
                  </View>
                ) : (
                  <View style={styles.row}>
                    <Button title="Camera" icon="camera-outline" variant="secondary" compact onPress={() => pick(true)} style={styles.flex} />
                    <Button title="Library" icon="images-outline" variant="secondary" compact onPress={() => pick(false)} style={styles.flex} />
                  </View>
                )}
              </View>
            )}

            <Button title="Share with the group" icon="paper-plane-outline" onPress={save} loading={saving} disabled={!canSave} />
            {!canSave && !saving && (
              <T variant="small" style={{ textAlign: 'center' }}>
                Add a title, at least one ingredient and one step.
              </T>
            )}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((Colors) => ({
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl * 2,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.md,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: 4,
    gap: 4,
  },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: Radius.sm,
  },
  segmentSelected: { backgroundColor: Colors.primary },
  segmentText: { fontWeight: '600' },
  sourceCard: { gap: Spacing.md },
  preview: { aspectRatio: 16 / 10, borderRadius: Radius.md, overflow: 'hidden', backgroundColor: Colors.primarySoft },
  previewEmpty: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: Spacing.sm },
  flex: { flex: 1 },
  converting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primarySoft,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  convertedNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primarySoft,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  form: { gap: Spacing.lg, marginTop: Spacing.sm },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  smallPhoto: { width: 56, height: 56, borderRadius: Radius.sm },
}));
