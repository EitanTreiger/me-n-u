import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { GroupGate } from '@/components/group-gate';
import { HomeSwitcher } from '@/components/home-switcher';
import { Screen } from '@/components/screen';
import { Button, Card, Chip, Divider, EmptyState, ErrorBanner, Field, IconButton, Loading, SectionHeader, Stepper, T } from '@/components/ui';
import { InputText, Spacing } from '@/constants/theme';
import { makeStyles, useColors } from '@/providers/appearance';
import { INGREDIENT_CATALOG } from '@/lib/ingredient-catalog';
import { readReceipt } from '@/lib/api';
import { formatIngredient, formatQuantity, pantryHas, parseIngredientLine } from '@/lib/ingredients';
import { PANTRY_SECTIONS, pantryLabel, pantrySection, stepFor } from '@/lib/pantry-units';
import { friendlyError } from '@/lib/supabase';
import { usePantry } from '@/providers/pantry';

type ReviewItem = { key: string; name: string; amount: string; unit: string };

/** "1.5", "1 1/2", "½" -> number (0 when empty). */
function parseAmount(text: string): number {
  return parseIngredientLine(`${text.trim()} x`)?.quantity ?? (Number(text) || 0);
}

function PantryList() {
  const Colors = useColors();
  const styles = useStyles();
  const pantry = usePantry();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState<string | null>(null);
  // Items read from a receipt, waiting to be checked before they're added.
  const [review, setReview] = useState<ReviewItem[] | null>(null);
  const [confirming, setConfirming] = useState(false);

  function editReview(key: string, patch: Partial<ReviewItem>) {
    setReview((prev) => prev?.map((r) => (r.key === key ? { ...r, ...patch } : r)) ?? null);
  }

  async function confirmReview() {
    if (!review) return;
    const items = review
      .filter((r) => r.name.trim())
      .map((r) => ({ name: r.name.trim(), quantity: parseAmount(r.amount), unit: r.unit.trim() }));
    setConfirming(true);
    try {
      await pantry.add(items);
      setReview(null);
      setScanned(`Added ${items.length} item${items.length === 1 ? '' : 's'} to the pantry.`);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setConfirming(false);
    }
  }

  // While typing, search every known ingredient.
  // Items already covered by the pantry ("onions" covers "onion") are hidden.
  const query = text.split(',').pop()!.trim().toLowerCase();
  const suggestions = query
    ? INGREDIENT_CATALOG.filter((i) => i.includes(query) && !pantryHas(pantry.names, i))
        .sort((a, b) => Number(!a.startsWith(query)) - Number(!b.startsWith(query)) || a.length - b.length)
        .slice(0, 30)
    : [];

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
      // Show the list for checking and editing before anything is added.
      else {
        setScanned(null);
        setReview(
          items.map((it, i) => ({
            key: `${i}-${it.name}`,
            name: it.name,
            amount: it.quantity ? formatQuantity(it.quantity) : '',
            unit: it.unit ?? '',
          })),
        );
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
      subtitle={
        <View style={{ gap: Spacing.xs }}>
          <HomeSwitcher />
          <T variant="small">{"This home's shared pantry. Recipes show what you still need to buy."}</T>
        </View>
      }
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
      {review && (
        <Card style={styles.review}>
          <View style={{ gap: 2 }}>
            <T variant="subheading">Check these before adding</T>
            <T variant="small">
              {"Fix anything that's wrong, remove what you don't want, or add anything that's missing. Leave the amount empty for things like spices or oils."}
            </T>
          </View>
          <View style={styles.reviewHeader}>
            <T variant="label" style={{ flex: 1 }}>
              Item
            </T>
            <T variant="label" style={styles.amountCol}>
              Amount
            </T>
            <T variant="label" style={styles.unitCol}>
              Unit
            </T>
            <View style={{ width: 30 }} />
          </View>
          {review.map((r) => (
            <View key={r.key} style={styles.reviewRow}>
              <TextInput
                value={r.name}
                onChangeText={(name) => editReview(r.key, { name })}
                placeholder="Item"
                placeholderTextColor={Colors.textMuted}
                style={[styles.reviewInput, { flex: 1 }]}
                accessibilityLabel="Item name"
              />
              <TextInput
                value={r.amount}
                onChangeText={(amount) => editReview(r.key, { amount })}
                placeholder="–"
                placeholderTextColor={Colors.textMuted}
                keyboardType="decimal-pad"
                style={[styles.reviewInput, styles.amountCol]}
                accessibilityLabel={`Amount of ${r.name}`}
              />
              <TextInput
                value={r.unit}
                onChangeText={(unit) => editReview(r.key, { unit })}
                placeholder="–"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
                style={[styles.reviewInput, styles.unitCol]}
                accessibilityLabel={`Unit for ${r.name}`}
              />
              <IconButton
                name="close"
                size={18}
                color={Colors.textMuted}
                label={`Don't add ${r.name}`}
                onPress={() => setReview((prev) => prev?.filter((x) => x.key !== r.key) ?? null)}
              />
            </View>
          ))}
          <Button
            title="Add another item"
            icon="add"
            variant="ghost"
            compact
            onPress={() => setReview((prev) => [...(prev ?? []), { key: `new-${Date.now()}`, name: '', amount: '', unit: '' }])}
            style={{ alignSelf: 'flex-start' }}
          />
          <View style={styles.reviewActions}>
            <Button
              title={`Add ${review.filter((r) => r.name.trim()).length} to pantry`}
              icon="checkmark"
              onPress={confirmReview}
              loading={confirming}
              disabled={!review.some((r) => r.name.trim())}
              style={{ flex: 1 }}
            />
            <Button title="Cancel" variant="secondary" onPress={() => setReview(null)} style={{ flex: 1 }} />
          </View>
        </Card>
      )}
      {scanned && !scanning && <T variant="small" style={{ color: Colors.success }}>{scanned}</T>}
      <ErrorBanner message={error} />

      {suggestions.length > 0 && (
        <>
          <SectionHeader title={`Matches for “${query}”`} />
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

      {pantry.loading ? (
        <Loading />
      ) : pantry.items.length === 0 ? (
        <>
          <SectionHeader title="In the pantry" />
          <Card>
            <EmptyState
              icon="basket-outline"
              title="Your pantry is empty"
              body="Add what's in your cupboards and fridge. Every recipe will then show exactly what's missing."
            />
          </Card>
        </>
      ) : (
        // Perishables grouped by kind (meat, vegetables, ...), basics last.
        PANTRY_SECTIONS.map((section) => {
          const items = pantry.items.filter((item) => pantrySection(item.name, item.quantity) === section);
          if (!items.length) return null;
          return (
            <View key={section}>
              <SectionHeader title={`${section} · ${items.length}`} />
              <Card style={styles.list}>
                {items.map((item, i) => {
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
            </View>
          );
        })
      )}
      {pantry.items.length > 0 && (
        <T variant="small" style={{ marginTop: Spacing.md }}>
          {"Shared by everyone in this home. Use − and + to update amounts; going to 0 removes the item. Things that are hard to measure, like salt, spices, oils and sauces, just show as in stock unless you add an amount (e.g. \"2 tbsp olive oil\")."}
        </T>
      )}
    </Screen>
  );
}

export default function PantryTab() {
  return (
    <GroupGate title="Pantry" adminOnly>
      <PantryList />
    </GroupGate>
  );
}

const useStyles = makeStyles((Colors) => ({
  addRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  scanCard: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.md, marginTop: Spacing.md },
  scanButtons: { flexDirection: 'row', gap: Spacing.sm },
  review: { gap: Spacing.md, marginTop: Spacing.md, borderColor: Colors.primary, borderWidth: 2 },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  reviewRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  reviewInput: {
    ...InputText,
    minHeight: 40,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: Spacing.sm,
    fontSize: 15,
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  amountCol: { width: 64 },
  unitCol: { width: 60 },
  reviewActions: { flexDirection: 'row', gap: Spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  list: { paddingVertical: Spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm },
  itemText: { fontSize: 15, fontWeight: '500' },
}));
