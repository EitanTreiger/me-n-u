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
  const fractions: [number, string][] = [
    [0.25, '¼'], [0.333, '⅓'], [0.5, '½'], [0.667, '⅔'], [0.75, '¾'],
  ];
  const match = fractions.find(([v]) => Math.abs(frac - v) < 0.02);
  if (match) return whole ? `${whole}${match[1]}` : match[1];
  return Number.isInteger(q) ? String(q) : String(Math.round(q * 100) / 100);
}

const COUNTABLE_UNITS = new Set(['cup', 'clove', 'can', 'slice', 'pinch', 'jar', 'bottle', 'stick', 'head', 'sprig', 'bunch', 'handful', 'package', 'piece']);

/** "cup" -> "cups" when there is more than one. */
export function displayUnit(unit: string, quantity: number): string {
  if (quantity > 1 && COUNTABLE_UNITS.has(unit)) return unit.endsWith('ch') ? `${unit}es` : `${unit}s`;
  return unit;
}

export function formatIngredient(i: Ingredient): string {
  const qty = formatQuantity(i.quantity);
  return [qty, displayUnit(i.unit, i.quantity), i.name].filter(Boolean).join(' ');
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
