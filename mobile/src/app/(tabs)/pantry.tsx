import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Button, Card, Chip, EmptyState, ErrorBanner, Field, Icon, Loading, SectionHeader, T } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { INGREDIENT_CATALOG } from '@/lib/ingredient-catalog';
import { pantryHas } from '@/lib/ingredients';
import { friendlyError } from '@/lib/supabase';
import { usePantry } from '@/providers/pantry';

const STAPLES = [
  'salt', 'pepper', 'olive oil', 'vegetable oil', 'butter', 'eggs', 'milk', 'flour', 'sugar', 'rice',
  'pasta', 'garlic', 'onion', 'canned tomatoes', 'chicken stock', 'soy sauce', 'bread', 'cheese',
];

export default function PantryTab() {
  const pantry = usePantry();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // While typing, search every known ingredient; otherwise show common staples.
  // Items already covered by the pantry ("onions" covers "onion") are hidden.
  const query = text.split(',').pop()!.trim().toLowerCase();
  const suggestions = (
    query
      ? INGREDIENT_CATALOG.filter((i) => i.includes(query)).sort(
          (a, b) => Number(!a.startsWith(query)) - Number(!b.startsWith(query)) || a.length - b.length,
        )
      : STAPLES
  )
    .filter((s) => !pantryHas(pantry.names, s))
    .slice(0, 30);

  async function add(names: string[]) {
    setBusy(true);
    setError(null);
    try {
      await pantry.add(names);
      setText('');
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  // Accept "eggs, milk, bread" in one go.
  const submit = () => add(text.split(/[,\n]/));

  return (
    <Screen
      title="My pantry"
      subtitle="What you already have. Recipes show what you still need to buy."
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await pantry.refresh();
        setRefreshing(false);
      }}>
      <View style={styles.addRow}>
        <View style={{ flex: 1 }}>
          <Field
            value={text}
            onChangeText={setText}
            placeholder="Search ingredients, or type your own"
            onSubmitEditing={submit}
            returnKeyType="done"
            autoCapitalize="none"
          />
        </View>
        <Button title="Add" icon="add" onPress={submit} loading={busy} disabled={!text.trim()} />
      </View>
      <ErrorBanner message={error} />

      {suggestions.length > 0 && (
        <>
          <SectionHeader title={query ? `Matches for “${query}”` : 'Quick add'} />
          <View style={styles.chips}>
            {suggestions.map((s) => (
              <Chip
                key={s}
                label={s}
                icon="add"
                onPress={() => add([...text.split(',').slice(0, -1), s])}
              />
            ))}
          </View>
        </>
      )}

      <SectionHeader title={`In my pantry · ${pantry.items.length}`} />
      {pantry.loading ? (
        <Loading />
      ) : pantry.items.length === 0 ? (
        <Card>
          <EmptyState
            icon="basket-outline"
            title="Your pantry is empty"
            body="Add what's in your cupboards and fridge. Every recipe will then show exactly what's missing."
          />
        </Card>
      ) : (
        <View style={styles.chips}>
          {pantry.items.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => pantry.remove(item.id)}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${item.name}`}
              style={({ pressed }) => [styles.item, pressed && { opacity: 0.6 }]}>
              <T style={styles.itemText}>{item.name}</T>
              <Icon name="close" size={14} color={Colors.textSecondary} />
            </Pressable>
          ))}
        </View>
      )}
      {pantry.items.length > 0 && (
        <T variant="small" style={{ marginTop: Spacing.md }}>
          Tap an item to remove it when you run out.
        </T>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  addRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primarySoft,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
  },
  itemText: { fontSize: 14, fontWeight: '500' },
});
