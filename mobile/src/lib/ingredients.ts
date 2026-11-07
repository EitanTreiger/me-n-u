import { convertWeight, isStaple } from './pantry-units';
import type { Ingredient } from './types';

// Things nearly every kitchen has; never reported as "missing".
const ALWAYS_ON_HAND = new Set(['water', 'ice', 'tap water', 'hot water', 'cold water', 'boiling water']);

const DESCRIPTORS =
  /\b(fresh|freshly|chopped|diced|minced|sliced|grated|shredded|ground|large|small|medium|ripe|boneless|skinless|organic|raw|cooked|frozen|canned|dried|whole|finely|roughly|thinly|optional|to taste|softened|melted|room temperature|peeled|crushed|packed|plain|extra virgin)\b/g;

function singular(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (/(oes|ches|shes|sses|xes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/** "2 Large Tomatoes, diced" -> "tomato" */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .split(',')[0]
    .replace(DESCRIPTORS, ' ')
    .replace(/[^a-z\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(singular)
    .join(' ')
    .trim();
}

/**
 * Does the pantry cover this ingredient? Matches on whole words in either
 * direction, so pantry "rice" covers "basmati rice" and pantry "olive oil"
 * covers "oil".
 */
export function pantryHas(pantry: string[], ingredientName: string): boolean {
  const target = normalizeName(ingredientName);
  if (!target || ALWAYS_ON_HAND.has(target)) return true;
  const padded = ` ${target} `;
  return pantry.some((raw) => {
    const p = normalizeName(raw);
    if (!p) return false;
    return p === target || padded.includes(` ${p} `) || ` ${p} `.includes(padded);
  });
}

export type PantryUse = {
  pantryId: string;
  name: string;
  before: string; // "12 eggs"
  after: number | null; // new amount, or null when it can't be worked out
  ingredient: Ingredient;
  unit: string; // the pantry item's unit, for showing `after`
};

/**
 * What cooking these ingredients takes out of the pantry. Amounts are
 * subtracted when pantry and recipe use the same unit; otherwise `after` is
 * null and the cook decides whether the item is used up.
 */
export function pantryUsage(
  pantry: { id: string; name: string; quantity: number; unit: string }[],
  ingredients: Ingredient[],
): PantryUse[] {
  const uses: PantryUse[] = [];
  for (const ing of ingredients) {
    const item = pantry.find((p) => pantryHas([p.name], ing.name));
    if (!item || uses.some((u) => u.pantryId === item.id) || ALWAYS_ON_HAND.has(normalizeName(ing.name))) continue;
    // Salt, spices and other staples are never used up.
    if (isStaple(item.name) || isStaple(ing.name)) continue;
    const pantryUnit = normalizeUnit(item.unit);
    const used =
      pantryUnit === normalizeUnit(ing.unit) ? ing.quantity : convertWeight(ing.quantity, normalizeUnit(ing.unit), pantryUnit);
    const after =
      item.quantity > 0 && ing.quantity > 0 && used !== null ? Math.max(0, Math.round((item.quantity - used) * 100) / 100) : null;
    uses.push({
      pantryId: item.id,
      name: item.name,
      before: item.quantity > 0 ? formatIngredient({ name: item.name, quantity: item.quantity, unit: item.unit }) : item.name,
      after,
      ingredient: ing,
      unit: item.unit,
    });
  }
  return uses;
}

export function missingIngredients(pantry: string[], ingredients: Ingredient[]): Ingredient[] {
  return ingredients.filter((i) => !pantryHas(pantry, i.name));
}

const UNIT_ALIASES: Record<string, string> = {
  tablespoon: 'tbsp', tablespoons: 'tbsp', tbsps: 'tbsp', tbs: 'tbsp',
  teaspoon: 'tsp', teaspoons: 'tsp', tsps: 'tsp',
  cups: 'cup', c: 'cup',
  grams: 'g', gram: 'g', gr: 'g',
  kilograms: 'kg', kilogram: 'kg', kgs: 'kg',
  milliliters: 'ml', millilitres: 'ml', milliliter: 'ml', millilitre: 'ml',
  liters: 'l', litres: 'l', liter: 'l', litre: 'l',
  pounds: 'lb', pound: 'lb', lbs: 'lb',
  ounces: 'oz', ounce: 'oz',
  cloves: 'clove', cans: 'can', slices: 'slice', pinches: 'pinch',
};

export function normalizeUnit(unit: string): string {
  const u = unit.trim().toLowerCase().replace(/\.$/, '');
  return UNIT_ALIASES[u] ?? u;
}

export function formatQuantity(q: number): string {
  if (!q) return '';
  const whole = Math.floor(q);
  const frac = q - whole;
  if (frac < 0.02) return String(whole);
  if (frac > 0.98) return String(whole + 1);
  const fractions: [number, string][] = [
    [0.125, '⅛'], [0.25, '¼'], [0.333, '⅓'], [0.375, '⅜'], [0.5, '½'], [0.625, '⅝'], [0.667, '⅔'], [0.75, '¾'], [0.875, '⅞'],
  ];
  const match = fractions.find(([v]) => Math.abs(frac - v) < 0.02);
  if (match) return whole ? `${whole}${match[1]}` : match[1];
  // Scaled amounts like 2.38 read better rounded: 1 decimal above 10, 2 below.
  const rounded = q >= 10 ? Math.round(q * 10) / 10 : Math.round(q * 100) / 100;
  return String(rounded);
}

const COUNTABLE_UNITS = new Set(['cup', 'clove', 'can', 'slice', 'pinch', 'jar', 'bottle', 'stick', 'head', 'sprig', 'bunch', 'handful', 'package', 'piece']);

/** "cup" -> "cups" when there is more than one. */
export function displayUnit(unit: string, quantity: number): string {
  if (quantity > 1 && COUNTABLE_UNITS.has(unit)) return unit.endsWith('ch') ? `${unit}es` : `${unit}s`;
  return unit;
}

/** "3 onion" -> "3 onions" for countable items with no unit. */
export function displayName(name: string, unit: string, quantity: number): string {
  if (unit) return name;
  if (quantity > 0 && quantity <= 1) {
    // "1 eggs" -> "1 egg" (only simple plurals; leave words like "hummus" alone)
    return name.replace(/([a-z]{3,}?)(oes|ies|s)\b(?=[^,]*$|,)/i, (m, stem: string, end: string) =>
      /(sses|ss|us|is)$/i.test(m) ? m : end === 'ies' ? `${stem}y` : end === 'oes' ? `${stem}o` : stem,
    );
  }
  if (quantity <= 1) return name;
  const [head, ...rest] = name.split(',');
  const words = head.trimEnd().split(' ');
  const last = words[words.length - 1];
  if (!last || /s$/i.test(last)) return name;
  words[words.length - 1] = /(ch|sh|x|o)$/i.test(last) ? `${last}es` : last.endsWith('y') && !/[aeiou]y$/i.test(last) ? `${last.slice(0, -1)}ies` : `${last}s`;
  return [words.join(' '), ...rest].join(',');
}

export function formatIngredient(i: Ingredient): string {
  const qty = formatQuantity(i.quantity);
  return [qty, displayUnit(i.unit, i.quantity), displayName(i.name, i.unit, i.quantity)].filter(Boolean).join(' ');
}

/** How many times to multiply a recipe that serves `base` to feed `people`. */
export function servingFactor(base: number | null | undefined, people: number | null | undefined): number {
  if (!base || !people || base <= 0 || people <= 0) return 1;
  return people / base;
}

const WHOLE_UNITS = new Set(['', 'clove', 'can', 'slice', 'piece', 'jar', 'bottle', 'head', 'stick', 'bunch', 'package', 'pkg']);

/** Make a scaled amount practical to measure in a kitchen. */
export function tidyAmount(i: Ingredient): Ingredient {
  let { quantity: q, unit } = i;
  unit = normalizeUnit(unit);
  if (!q) return i;
  // Switch to a more sensible spoon/cup size.
  if (unit === 'cup' && q < 0.25) { q *= 16; unit = 'tbsp'; }
  if (unit === 'tbsp' && q < 1) { q *= 3; unit = 'tsp'; }
  if (unit === 'tsp' && q >= 3 && Math.abs(q / 3 - Math.round(q / 3 * 4) / 4) < 0.01) { q /= 3; unit = 'tbsp'; }

  if (WHOLE_UNITS.has(unit)) {
    // You can't buy 2⅓ eggs: round up (½ is fine for small amounts).
    q = q < 1 ? Math.ceil(q * 2) / 2 : Math.ceil(q - 0.05);
  } else if (['cup', 'tbsp', 'tsp'].includes(unit)) {
    q = q < 1 ? Math.max(0.125, Math.round(q * 8) / 8) : Math.round(q * 4) / 4;
  } else if (unit === 'g' || unit === 'ml') {
    q = q >= 100 ? Math.round(q / 5) * 5 : Math.round(q);
  } else if (unit === 'lb' || unit === 'oz') {
    q = Math.max(0.25, Math.round(q * 4) / 4);
  } else if (unit === 'kg' || unit === 'l') {
    q = Math.round(q * 100) / 100;
  }
  return { ...i, quantity: q, unit };
}

/** Multiply every quantity; "to taste" items (quantity 0) stay as they are. */
export function scaleIngredients(ingredients: Ingredient[], factor: number, { tidy = true } = {}): Ingredient[] {
  if (factor === 1) return ingredients;
  return ingredients.map((i) => {
    const scaled = { ...i, quantity: i.quantity ? i.quantity * factor : 0 };
    return tidy ? tidyAmount(scaled) : scaled;
  });
}

/** "×5", "×2½", "×0.5" style label for a factor. */
export function formatFactor(factor: number): string {
  return `×${formatQuantity(Math.round(factor * 100) / 100) || factor.toFixed(2)}`;
}

const UNICODE_FRACTIONS: Record<string, number> = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };

function parseQuantity(raw: string): number {
  let total = 0;
  for (const part of raw.trim().split(/\s+/)) {
    if (!part) continue;
    const trailing = UNICODE_FRACTIONS[part.slice(-1)];
    if (trailing !== undefined) {
      total += (part.length > 1 ? Number(part.slice(0, -1)) || 0 : 0) + trailing;
    } else if (part.includes('/')) {
      const [n, d] = part.split('/').map(Number);
      if (d) total += n / d;
    } else {
      total += Number(part) || 0;
    }
  }
  return total;
}

const KNOWN_UNITS = new Set([
  ...Object.keys(UNIT_ALIASES),
  ...Object.values(UNIT_ALIASES),
  'pinch', 'dash', 'bunch', 'handful', 'package', 'pkg', 'jar', 'bottle', 'stick', 'head', 'sprig', 'piece', 'pieces',
]);

/** "1 1/2 cups rolled oats" -> { quantity: 1.5, unit: 'cup', name: 'rolled oats' } */
export function parseIngredientLine(line: string): Ingredient | null {
  const text = line.replace(/^[-*•\s]+/, '').trim();
  if (!text) return null;
  const m = text.match(/^((?:\d+\/\d+|\d*[¼½¾⅓⅔⅛]|\d+(?:\.\d+)?)(?:\s+(?:\d+\/\d+|[¼½¾⅓⅔⅛]))?)\s*(.*)$/);
  if (!m) return { name: text, quantity: 0, unit: '' };
  const quantity = parseQuantity(m[1]);
  const rest = m[2].trim();
  const [first, ...others] = rest.split(/\s+/);
  const candidate = first?.toLowerCase().replace(/\.$/, '');
  if (candidate && KNOWN_UNITS.has(candidate) && others.length) {
    return { quantity, unit: normalizeUnit(candidate), name: others.join(' ').replace(/^of\s+/i, '') };
  }
  return { quantity, unit: '', name: rest || text };
}

export type GroceryLine = {
  key: string;
  name: string;
  quantity: number;
  unit: string;
  recipes: string[];
};

/** Combine ingredients from many recipes into one shopping list. */
export function aggregateIngredients(entries: { recipeTitle: string; ingredients: Ingredient[] }[]): GroceryLine[] {
  const lines = new Map<string, GroceryLine>();
  for (const { recipeTitle, ingredients } of entries) {
    for (const ing of ingredients) {
      // Group by the normalised name ("carrot"), but show the recipe's own
      // wording without prep notes ("carrots, diced" -> "carrots").
      const name = ing.name.split(',')[0].replace(/\(.*?\)/g, '').trim().toLowerCase() || ing.name;
      const unit = normalizeUnit(ing.unit ?? '');
      const key = `${normalizeName(ing.name) || name}|${unit}`;
      const existing = lines.get(key);
      if (existing) {
        existing.quantity += ing.quantity || 0;
        if (!existing.recipes.includes(recipeTitle)) existing.recipes.push(recipeTitle);
      } else {
        lines.set(key, { key, name, quantity: ing.quantity || 0, unit, recipes: [recipeTitle] });
      }
    }
  }
  return [...lines.values()].sort((a, b) => a.name.localeCompare(b.name));
}
