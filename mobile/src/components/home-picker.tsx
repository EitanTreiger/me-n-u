import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, TextInput, View } from 'react-native';

import { InputText, Radius, Spacing } from '@/constants/theme';
import { listAllHomes } from '@/lib/api';
import { friendlyError } from '@/lib/supabase';
import { makeStyles, useColors } from '@/providers/appearance';
import { useGroups } from '@/providers/groups';

import { ErrorBanner, Icon, Loading, T } from './ui';

type HomeOption = { id: string; name: string };

/**
 * Dropdown of every home, for choosing one to join. Homes you're already in
 * are shown but can't be picked. Searchable when the list gets long.
 */
export function HomePicker({ value, onChange }: { value: HomeOption | null; onChange: (home: HomeOption) => void }) {
  const Colors = useColors();
  const styles = useStyles();
  const { homes: mine } = useGroups();
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState<HomeOption[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listAllHomes()
      .then((rows) => alive && setAll(rows))
      .catch((e) => {
        if (!alive) return;
        setError(friendlyError(e));
        setAll([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const q = query.trim().toLowerCase();
  const shown = (all ?? []).filter((h) => !q || h.name.toLowerCase().includes(q));

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="combobox"
        accessibilityLabel={value ? `Home: ${value.name}. Change` : 'Choose a home'}
        style={({ pressed }) => [styles.field, pressed && { opacity: 0.7 }]}>
        <Icon name="home-outline" size={18} color={value ? Colors.primaryStrong : Colors.textMuted} />
        <T style={[{ flex: 1 }, !value && { color: Colors.textMuted }]} numberOfLines={1}>
          {value?.name ?? 'Choose a home'}
        </T>
        <Icon name="chevron-down" size={18} color={Colors.textMuted} />
      </Pressable>
      <ErrorBanner message={error} />

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close">
          <View style={styles.sheet} onStartShouldSetResponder={() => true}>
            <T variant="label" style={styles.sheetTitle}>
              Choose your home
            </T>
            <View style={styles.search}>
              <Icon name="search" size={16} color={Colors.textMuted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search homes"
                placeholderTextColor={Colors.textMuted}
                style={styles.searchInput}
                autoCorrect={false}
              />
            </View>
            {all === null ? (
              <Loading />
            ) : shown.length === 0 ? (
              <T variant="small" style={styles.empty}>
                {all.length === 0 ? 'There are no homes yet. Create one instead.' : `No homes match "${query.trim()}".`}
              </T>
            ) : (
              <ScrollView style={styles.list}>
                {shown.map((h) => {
                  const joined = mine.some((m) => m.id === h.id);
                  const selected = value?.id === h.id;
                  return (
                    <Pressable
                      key={h.id}
                      disabled={joined}
                      onPress={() => {
                        onChange(h);
                        setOpen(false);
                        setQuery('');
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected, disabled: joined }}
                      style={({ pressed }) => [styles.row, pressed && { backgroundColor: Colors.primarySoft }]}>
                      <Icon
                        name={selected ? 'radio-button-on' : 'radio-button-off'}
                        size={20}
                        color={joined ? Colors.border : selected ? Colors.primaryStrong : Colors.borderStrong}
                      />
                      <T style={[{ flex: 1 }, joined && { color: Colors.textMuted }]} numberOfLines={1}>
                        {h.name}
                      </T>
                      {joined && <T variant="small">Joined</T>}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const useStyles = makeStyles((Colors) => ({
  field: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md + 2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
  },
  backdrop: { flex: 1, backgroundColor: Colors.backdrop, justifyContent: 'center', padding: Spacing.lg },
  sheet: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    alignSelf: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.sm,
  },
  sheetTitle: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.sm },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
  },
  searchInput: { ...InputText, flex: 1, fontSize: 15, color: Colors.text, paddingVertical: Spacing.sm },
  list: { flexGrow: 0 },
  empty: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
}));
