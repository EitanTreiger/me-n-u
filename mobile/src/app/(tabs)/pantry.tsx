import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Button, Card, Chip, EmptyState, ErrorBanner, Field, Icon, Loading, SectionHeader, T } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { INGREDIENT_CATALOG } from '@/lib/ingredient-catalog';
import { readReceipt } from '@/lib/api';
import { formatIngredient, pantryHas } from '@/lib/ingredients';
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
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState<string | null>(null);

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

  // Accept "5 eggs, milk, 2 cups rice" in one go.
  const submit = () => add(text.split(/[,\n]/));

  // Photo of a receipt or shopping list -> items with amounts.
  async function scan(fromCamera: boolean) {
    setError(null);
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return setError('Allow photo access to scan a receipt.');
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6, base64: true };
    const result = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    const asset = result.canceled ? null : result.assets[0];
    if (!asset?.base64) return;
    setScanning(true);
    try {
      const items = await readReceipt(asset.base64, asset.mimeType ?? 'image/jpeg');
      if (!items.length) setError("Couldn't find any food items in that photo.");
      else {
        await pantry.add(items);
        setScanned(`Added ${items.length} item${items.length === 1 ? '' : 's'} from your photo.`);
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setScanning(false);
    }
  }

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
            placeholder="Search, or type amounts like “5 eggs”"
            onSubmitEditing={submit}
            returnKeyType="done"
            autoCapitalize="none"
          />
        </View>
        <Button title="Add" icon="add" onPress={submit} loading={busy} disabled={!text.trim()} />
      </View>
      <Card style={styles.scanCard}>
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="subheading">Scan a receipt or list</T>
          <T variant="small">Snap your grocery receipt or shopping list to add everything at once.</T>
        </View>
        <View style={styles.scanButtons}>
          <Button title="Camera" icon="camera-outline" compact onPress={() => scan(true)} loading={scanning} />
          <Button title="Photo" icon="images-outline" compact variant="secondary" onPress={() => scan(false)} disabled={scanning} />
        </View>
      </Card>
      {scanning && <T variant="small">Reading your photo…</T>}
      {scanned && !scanning && <T variant="small" style={{ color: Colors.success }}>{scanned}</T>}
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
              <T style={styles.itemText}>
                {item.quantity > 0 ? formatIngredient({ name: item.name, quantity: item.quantity, unit: item.unit }) : item.name}
              </T>
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
  scanCard: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.md, marginTop: Spacing.md },
  scanButtons: { flexDirection: 'row', gap: Spacing.sm },
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
