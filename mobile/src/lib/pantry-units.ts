// How the pantry counts things.
// - Staples (salt, spices, dried herbs...) are just "have it" or not: no
//   amount, and cooking never uses them up.
// - Everything else is counted the way a grocery store sells it: meat, fish
//   and loose produce by the pound, herbs by the bunch, eggs by count...

const STAPLE_WORDS = [
  'salt', 'pepper', 'black pepper', 'white pepper', 'peppercorn', 'spice', 'seasoning',
  'cumin', 'paprika', 'smoked paprika', 'turmeric', 'garam masala', 'curry powder', 'chili powder',
  'chili flakes', 'red pepper flakes', 'cinnamon', 'nutmeg', 'allspice', 'clove powder', 'cardamom',
  'coriander', 'oregano', 'dried thyme', 'thyme', 'dried basil', 'rosemary', 'bay leaf', 'bay leaves',
  'sage', 'dill weed', 'star anise', 'saffron', 'berbere', 'five spice', 'italian seasoning',
  'garlic powder', 'onion powder', 'mustard powder', 'ginger powder', 'ground ginger',
  'baking soda', 'baking powder', 'vanilla extract', 'vanilla', 'yeast', 'cornstarch',
  'msg', 'bouillon', 'stock cube',
  // cooking basics a kitchen just has
  'olive oil', 'vegetable oil', 'canola oil', 'cooking oil', 'sesame oil', 'oil', 'vinegar', 'white vinegar',
  'rice vinegar', 'cooking spray',
];

const isWord = (name: string, word: string) => new RegExp(`(^|\\s)${word}(s|es)?($|\\s)`, 'i').test(name);

const MEAT_WORDS = ['beef', 'pork', 'lamb', 'turkey', 'chicken', 'veal', 'meat', 'sausage', 'bison'];
// Liquids and sauces are sold by the bottle or carton, never by the pound.
const LIQUID_WORDS = /\b(broth|stock|sauce|oil|milk|juice|paste|cream|water|vinegar|syrup|wine|purée|puree)\b/;

/** Salt, spices, dried herbs and similar: in stock or not, never counted. */
export function isStaple(name: string): boolean {
  const n = name.toLowerCase().trim();
  // Fresh peppers are produce, not the spice; ground beef is meat.
  if (/\b(bell|green|red|yellow|jalapeno|chili|scotch bonnet|hot)\s+peppers?\b/.test(n) && !/flakes|powder/.test(n)) return false;
  if (/\bfresh\b/.test(n) || MEAT_WORDS.some((w) => isWord(n, w))) return false;
  return STAPLE_WORDS.some((w) => isWord(n, w)) || /\b(dried|ground)\s+\w+/.test(n) || /\bpowder\b/.test(n);
}

const CONDIMENTS = /\b(ketchup|mustard|mayonnaise|mayo|honey|jam|jelly|peanut butter|hot sauce|sriracha|salsa|dressing|relish|hoisin|tahini|miso|gochujang|curry paste|maple syrup|molasses|worcestershire)\b/;

/**
 * Hard to measure how much is left (oils, sauces, condiments, liquids,
 * spices): tracked as "in stock" unless a real measurement is given.
 */
export function isHardToMeasure(name: string): boolean {
  const n = name.toLowerCase();
  return isStaple(n) || LIQUID_WORDS.test(n) || CONDIMENTS.test(n);
}

/** A unit that measures an amount (2 tbsp, 500 ml, 1 lb), not just a count. */
export function isMeasureUnit(unit: string): boolean {
  return MEASURE_UNITS.includes(unit);
}

/** Real kitchen measurements only: no "bag", "box", "bunch" or "head". */
const MEASURE_UNITS = ['tsp', 'tbsp', 'cup', 'ml', 'l', 'g', 'kg', 'oz', 'lb', 'fl oz', 'can'];

const BY_POUND = [
  // meat and fish
  'chicken', 'beef', 'steak', 'pork', 'lamb', 'turkey', 'veal', 'ground', 'mince', 'sausage', 'ham', 'bacon',
  'brisket', 'ribs', 'chuck', 'sirloin', 'ribeye', 'tenderloin', 'loin', 'fish', 'salmon', 'cod', 'tuna steak',
  'tilapia', 'shrimp', 'prawn', 'scallop', 'crab', 'lobster', 'mussel', 'clam',
  // loose produce sold by weight
  'potato', 'sweet potato', 'carrot', 'tomato', 'apple', 'pear', 'banana', 'grape', 'zucchini', 'eggplant',
  'mushroom', 'green bean', 'beet', 'parsnip', 'turnip', 'squash', 'peach', 'plum', 'cherry', 'onion',
  'ginger root', 'cabbage', 'cauliflower', 'broccoli', 'kale', 'asparagus', 'pasta', 'spaghetti', 'macaroni',
  'penne', 'noodle', 'lasagna', 'fettuccine', 'cheese', 'butter',
];

// Dry goods and fresh herbs are measured in cups, like recipes use them.
const BY_CUP = /\b(rice|flour|sugar|brown sugar|oats|lentils|quinoa|couscous|bulgur|dried beans|chickpeas|breadcrumbs|panko|cilantro|parsley|mint|basil|dill|spinach|frozen peas|corn|cereal|nuts|peanuts|almonds|chocolate chips|raisins)\b/;

/**
 * The real measurement this is usually counted in ('' = a count, like 6 eggs):
 * pounds for meat, fish, produce, pasta and cheese; cups for dry goods and
 * herbs; cans for canned goods. Used when something is added without a unit.
 */
export function groceryUnit(name: string): string {
  const n = name.toLowerCase();
  if (isStaple(n) || LIQUID_WORDS.test(n)) return '';
  if (/\b(canned|can of)\b/.test(n)) return 'can';
  if (BY_CUP.test(n)) return 'cup';
  if (BY_POUND.some((w) => isWord(n, w))) return 'lb';
  return '';
}

const UNIT_WORDS: Record<string, [string, string]> = {
  lb: ['pound', 'pounds'],
  cup: ['cup', 'cups'],
  tbsp: ['tbsp', 'tbsp'],
  tsp: ['tsp', 'tsp'],
  oz: ['oz', 'oz'],
  'fl oz': ['fl oz', 'fl oz'],
  g: ['g', 'g'],
  kg: ['kg', 'kg'],
  ml: ['ml', 'ml'],
  l: ['liter', 'liters'],
  can: ['can', 'cans'],
};

/** Pantry label with the unit in words: "2 cups of rice", "1.5 pounds of chicken", "6 eggs". */
export function pantryLabel(name: string, quantity: number, unit: string, formatQuantity: (q: number) => string): string {
  const q = formatQuantity(quantity) || String(quantity);
  const words = UNIT_WORDS[unit];
  if (!words) return `${q} ${name}`;
  return `${q} ${quantity === 1 ? words[0] : words[1]} of ${name}`;
}

// ---------------------------------------------------------------------------
// Pantry sections: perishables grouped by kind (they share measurements),
// then the basics (spices, oils, sauces) at the bottom.
// ---------------------------------------------------------------------------

export const PANTRY_SECTIONS = [
  'Meat & fish',
  'Vegetables',
  'Fruit',
  'Dairy & eggs',
  'Grains, pasta & baking',
  'Canned & jarred',
  'Other',
  'Basics: spices, oils & sauces',
] as const;
export type PantrySection = (typeof PANTRY_SECTIONS)[number];

const MEAT_FISH = /\b(chicken|beef|steak|pork|lamb|turkey|veal|mince|sausages?|ham|bacon|brisket|ribs|chuck|sirloin|ribeye|tenderloin|loin|fish|salmon|cod|tuna|tilapia|shrimp|prawns?|scallops?|crab|lobster|mussels?|clams?|chorizo|pepperoni|meatballs?|ground (beef|pork|turkey|lamb|chicken))\b/;
const VEGETABLES = /\b(onions?|garlic|potato(es)?|sweet potato(es)?|carrots?|tomato(es)?|peppers?|zucchini|eggplants?|mushrooms?|broccoli|cauliflower|cabbage|lettuce|romaine|spinach|kale|chard|celery|cucumbers?|peas|green beans?|corn|asparagus|beets?|parsnips?|turnips?|squash|leeks?|shallots?|scallions?|green onions?|bok choy|bean sprouts|avocados?|ginger|cilantro|parsley|basil|mint|dill|jalapenos?|chilies|chillies)\b/;
const FRUIT = /\b(apples?|bananas?|oranges?|lemons?|limes?|grapes?|strawberries|blueberries|raspberries|berries|peaches|peach|pears?|plums?|cherries|watermelon|melon|pineapple|mango(es)?|kiwi|apricots?|raisins|dates)\b/;
const DAIRY_EGGS = /\b(eggs?|cheese|cheddar|mozzarella|parmesan|feta|ricotta|paneer|gruyere|butter|yogurt|yoghurt|cream cheese|sour cream|cheese curds)\b/;
const GRAINS = /\b(rice|flour|sugar|oats|pasta|spaghetti|macaroni|penne|noodles?|lasagna|fettuccine|bread|tortillas?|pita|buns?|rolls?|baguette|couscous|quinoa|bulgur|lentils|beans|chickpeas|cereal|crackers|breadcrumbs|panko|cornmeal|chocolate chips)\b/;

/** Which pantry section an item belongs in. Items with no amount go to the basics. */
export function pantrySection(name: string, quantity: number): PantrySection {
  const n = name.toLowerCase();
  if (quantity <= 0 || isHardToMeasure(n)) return 'Basics: spices, oils & sauces';
  if (/\b(canned|can of|jar of)\b/.test(n)) return 'Canned & jarred';
  if (MEAT_FISH.test(n)) return 'Meat & fish';
  if (DAIRY_EGGS.test(n)) return 'Dairy & eggs';
  if (FRUIT.test(n)) return 'Fruit';
  if (VEGETABLES.test(n)) return 'Vegetables';
  if (GRAINS.test(n)) return 'Grains, pasta & baking';
  return 'Other';
}

const WEIGHT_IN_LB: Record<string, number> = { lb: 1, oz: 1 / 16, g: 1 / 453.6, kg: 2.2046 };

/** Convert between weight units (g, kg, oz, lb); null if either isn't a weight. */
export function convertWeight(quantity: number, from: string, to: string): number | null {
  const a = WEIGHT_IN_LB[from];
  const b = WEIGHT_IN_LB[to];
  return a && b ? (quantity * a) / b : null;
}

/** Step for the pantry's - / + buttons: half pounds and cups, whole counts. */
export function stepFor(unit: string): number {
  return unit === 'lb' || unit === 'kg' || unit === 'cup' ? 0.5 : 1;
}
