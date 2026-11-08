import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

import { ErrorBanner, Icon, Loading, T, type IconName } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { getRecipe, speakText } from '@/lib/api';
import { friendlyError } from '@/lib/supabase';
import type { RecipeWithStats } from '@/lib/types';
import { makeStyles, useColors } from '@/providers/appearance';
import { useGroups } from '@/providers/groups';

/** Reads a recipe's steps aloud one at a time, with back / replay / next controls. */
export default function ListenScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { activeHome } = useGroups();
  const styles = useStyles();
  const Colors = useColors();

  const [recipe, setRecipe] = useState<RecipeWithStats | null>(null);
  const [step, setStep] = useState(0);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);

  // One request per step, shared between playing it and fetching it ahead of time.
  const clips = useRef(new Map<number, Promise<string>>());
  const latest = useRef(0);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    getRecipe(id, activeHome?.id)
      .then(({ recipe }) => setRecipe(recipe))
      .catch((e) => setError(friendlyError(e)));
  }, [id, activeHome?.id]);

  const clip = useCallback(
    (i: number) => {
      if (!recipe || i < 0 || i >= recipe.steps.length) return null;
      let p = clips.current.get(i);
      if (!p) {
        p = speakText(`Step ${i + 1}. ${recipe.steps[i]}`);
        p.catch(() => clips.current.delete(i)); // allow a retry after a failure
        clips.current.set(i, p);
      }
      return p;
    },
    [recipe],
  );

  const playStep = useCallback(
    async (i: number) => {
      const p = clip(i);
      if (!p) return;
      const ticket = ++latest.current;
      setError(null);
      setFetching(true);
      player.pause();
      try {
        const url = await p;
        if (ticket !== latest.current) return; // they moved on while it loaded
        player.replace({ uri: url });
        player.play();
        clip(i + 1); // get the next step ready
      } catch (e) {
        if (ticket === latest.current) setError(friendlyError(e));
      } finally {
        if (ticket === latest.current) setFetching(false);
      }
    },
    [clip, player],
  );

  // Read each step as soon as it becomes the current one.
  useEffect(() => {
    if (recipe) playStep(step);
  }, [recipe, step, playStep]);

  if (!recipe) return error ? <ErrorBanner message={error} /> : <Loading />;

  const total = recipe.steps.length;
  const isFirst = step === 0;
  const isLast = step === total - 1;

  function replay() {
    if (status.isLoaded && !fetching) {
      player.seekTo(0);
      player.play();
    } else {
      playStep(step);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Stack.Screen options={{ title: recipe.title }} />

      <View style={styles.card}>
        <T variant="label">
          Step {step + 1} of {total}
        </T>
        <T style={styles.stepText}>{recipe.steps[step]}</T>
        <View style={styles.status}>
          {fetching ? (
            <>
              <ActivityIndicator size="small" color={Colors.primaryStrong} />
              <T variant="small">Getting the voice ready…</T>
            </>
          ) : status.playing ? (
            <>
              <Icon name="volume-high-outline" size={16} color={Colors.primaryStrong} />
              <T variant="small">Reading aloud</T>
            </>
          ) : (
            <T variant="small"> </T>
          )}
        </View>
      </View>

      <View style={styles.dots}>
        {recipe.steps.map((_, i) => (
          <View key={i} style={[styles.dot, i === step && styles.dotActive, i < step && styles.dotDone]} />
        ))}
      </View>

      <ErrorBanner message={error} />

      <View style={styles.controls}>
        <Control icon="play-skip-back" label="Previous step" disabled={isFirst} onPress={() => setStep(step - 1)} />
        <Control icon="refresh" label="Replay this step" big onPress={replay} />
        <Control icon="play-skip-forward" label="Next step" disabled={isLast} onPress={() => setStep(step + 1)} />
      </View>

      <View style={styles.list}>
        <T variant="label">All steps</T>
        {recipe.steps.map((s, i) => (
          <Pressable
            key={i}
            onPress={() => (i === step ? replay() : setStep(i))}
            accessibilityRole="button"
            accessibilityLabel={`Go to step ${i + 1}`}
            style={({ pressed }) => [styles.row, i === step && styles.rowActive, pressed && { opacity: 0.7 }]}>
            <T variant="small" style={styles.rowNumber}>
              {i + 1}
            </T>
            <T style={{ flex: 1 }} numberOfLines={2}>
              {s}
            </T>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function Control({
  icon,
  label,
  onPress,
  disabled,
  big,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  big?: boolean;
}) {
  const styles = useStyles();
  const Colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.control,
        big && styles.controlBig,
        disabled && styles.controlDisabled,
        pressed && { opacity: 0.75 },
      ]}>
      <Icon name={icon} size={big ? 34 : 26} color={big ? Colors.text : disabled ? Colors.textMuted : Colors.primaryStrong} />
    </Pressable>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { padding: Spacing.lg, gap: Spacing.lg, width: '100%', maxWidth: 640, alignSelf: 'center' },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.xl,
    gap: Spacing.md,
    minHeight: 200,
  },
  stepText: { fontSize: 24, lineHeight: 34, fontWeight: '500' },
  status: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 20 },
  dots: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.borderStrong },
  dotDone: { backgroundColor: Colors.primary },
  dotActive: { backgroundColor: Colors.primaryStrong, width: 20 },
  controls: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: Spacing.xl },
  control: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  controlBig: { width: 84, height: 84, borderRadius: 42, backgroundColor: Colors.primary, borderColor: Colors.primary },
  controlDisabled: { opacity: 0.4, borderColor: Colors.border },
  list: { gap: Spacing.sm },
  row: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  rowActive: { borderColor: Colors.primaryStrong, backgroundColor: Colors.primarySoft },
  rowNumber: { width: 20, textAlign: 'center', fontWeight: '700' },
}));
