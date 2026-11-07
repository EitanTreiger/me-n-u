import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Button, Card, Chip, Divider, EmptyState, ErrorBanner, Field, IconButton, Loading, SectionHeader, Stepper, T } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { INGREDIENT_CATALOG } from '@/lib/ingredient-catalog';
import { readReceipt } from '@/lib/api';
import { formatIngredient, formatQuantity, pantryHas } from '@/lib/ingredients';
import { pantryLabel, stepFor } from '@/lib/pantry-units';
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
      title="Pantry"
      subtitle="Your community's shared pantry. Recipes show what you still need to buy."
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

      <SectionHeader title={`In the pantry · ${pantry.items.length}`} />
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
        <Card style={styles.list}>
          {pantry.items.map((item, i) => {
            // No amount (salt, oils, sauces...): just "in stock".
            const staple = item.quantity <= 0;
            const step = stepFor(item.unit);
            return (
              <View key={item.id}>
                {i > 0 && <Divider />}
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <T style={styles.itemText} numberOfLines={1}>
                      {staple
                        ? item.name
                        : item.unit
                          ? pantryLabel(item.name, item.quantity, item.unit, formatQuantity)
                          : formatIngredient({ name: item.name, quantity: item.quantity, unit: '' })}
                    </T>
                  </View>
                  {staple ? (
                    // Salt, spices and the like: just "have it" or not.
                    <Chip label="In stock" tone="success" icon="checkmark-circle" />
                  ) : (
                    <>
                      <Stepper
                        value={Math.round(item.quantity / step) * step}
                        min={0}
                        max={999}
                        step={step}
                        label={item.name}
                        onChange={(n) => pantry.setQuantity(item.id, n)}
                      />
                    </>
                  )}
                  <IconButton
                    name="trash-outline"
                    size={18}
                    color={Colors.textMuted}
                    label={`Remove ${item.name}`}
                    onPress={() => pantry.remove(item.id)}
                  />
                </View>
              </View>
            );
          })}
        </Card>
      )}
      {pantry.items.length > 0 && (
        <T variant="small" style={{ marginTop: Spacing.md }}>
          {"Shared by everyone in your community. Use − and + to update amounts; going to 0 removes the item. Things that are hard to measure, like salt, spices, oils and sauces, just show as in stock unless you add an amount (e.g. \"2 tbsp olive oil\")."}
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
  list: { paddingVertical: Spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm },
  itemText: { fontSize: 15, fontWeight: '500' },
});
