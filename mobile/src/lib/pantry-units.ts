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
  return ['tsp', 'tbsp', 'cup', 'ml', 'l', 'g', 'kg', 'oz', 'lb', 'fl oz', 'bottle', 'jar', 'can', 'bag', 'box'].includes(unit);
}

const BY_POUND = [
  // meat and fish
  'chicken', 'beef', 'steak', 'pork', 'lamb', 'turkey', 'veal', 'ground', 'mince', 'sausage', 'ham', 'bacon',
  'brisket', 'ribs', 'chuck', 'sirloin', 'ribeye', 'tenderloin', 'loin', 'fish', 'salmon', 'cod', 'tuna steak',
  'tilapia', 'shrimp', 'prawn', 'scallop', 'crab', 'lobster', 'mussel', 'clam',
  // loose produce sold by weight
  'potato', 'sweet potato', 'carrot', 'tomato', 'apple', 'pear', 'banana', 'grape', 'zucchini', 'eggplant',
  'mushroom', 'green bean', 'beet', 'parsnip', 'turnip', 'squash', 'peach', 'plum', 'cherry', 'onion',
  'ginger root',
];

const BY_BUNCH = ['cilantro', 'parsley', 'mint', 'basil', 'dill', 'green onion', 'scallion', 'kale', 'chard', 'asparagus'];
const BY_HEAD = ['lettuce', 'romaine', 'cabbage', 'cauliflower', 'broccoli', 'garlic'];

/**
 * The unit a grocery store sells this in ('' = count, like 6 eggs).
 * Used as the default when something is added to the pantry without a unit.
 */
export function groceryUnit(name: string): string {
  const n = name.toLowerCase();
  if (isStaple(n) || LIQUID_WORDS.test(n)) return '';
  if (/\b(canned|can of)\b/.test(n)) return 'can';
  if (/\b(pasta|spaghetti|macaroni|penne|noodles?|lasagna|fettuccine|cereal|crackers)\b/.test(n)) return 'box';
  if (/\b(rice|flour|sugar|oats|lentils|quinoa|couscous|bulgur|dried beans|chickpeas)\b/.test(n) && !/\bcooked\b/.test(n)) return 'bag';
  if (BY_HEAD.some((w) => isWord(n, w))) return 'head';
  if (BY_BUNCH.some((w) => isWord(n, w))) return 'bunch';
  if (BY_POUND.some((w) => isWord(n, w))) return 'lb';
  return '';
}

const WEIGHT_IN_LB: Record<string, number> = { lb: 1, oz: 1 / 16, g: 1 / 453.6, kg: 2.2046 };

/** Convert between weight units (g, kg, oz, lb); null if either isn't a weight. */
export function convertWeight(quantity: number, from: string, to: string): number | null {
  const a = WEIGHT_IN_LB[from];
  const b = WEIGHT_IN_LB[to];
  return a && b ? (quantity * a) / b : null;
}

/** Step for the pantry's - / + buttons: half pounds, whole counts. */
export function stepFor(unit: string): number {
  return unit === 'lb' || unit === 'kg' ? 0.5 : 1;
}
