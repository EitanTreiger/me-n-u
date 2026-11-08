// Turn recipe shorthand into words a voice reads naturally, e.g.
// "Add 150g flour and 1/2 tsp salt, bake at 180°C for 20-25 mins"
// -> "Add 150 grams flour and one half teaspoon salt, bake at 180 degrees Celsius for 20 to 25 minutes".
// Only the audio uses this; the recipe text shown in the app is unchanged.

const UNITS: [RegExp, string, string][] = [
  // [pattern (after a number), singular, plural]
  [/fl\.?\s?oz\.?/, 'fluid ounce', 'fluid ounces'],
  [/kgs?/, 'kilogram', 'kilograms'],
  [/mgs?/, 'milligram', 'milligrams'],
  [/g(?:rs?|ms?)?/, 'gram', 'grams'],
  [/ml|mL|ML/, 'millilitre', 'millilitres'],
  [/cl|cL/, 'centilitre', 'centilitres'],
  [/dl|dL/, 'decilitre', 'decilitres'],
  [/l|L|ltrs?/, 'litre', 'litres'],
  [/tbsps?|tbs|tbl|Tbsp|TBSP|Tbs|T/, 'tablespoon', 'tablespoons'],
  [/tsps?|TSP|Tsp|t/, 'teaspoon', 'teaspoons'],
  [/oz/, 'ounce', 'ounces'],
  [/lbs?/, 'pound', 'pounds'],
  [/pts?/, 'pint', 'pints'],
  [/qts?/, 'quart', 'quarts'],
  [/gal/, 'gallon', 'gallons'],
  [/mm/, 'millimetre', 'millimetres'],
  [/cm/, 'centimetre', 'centimetres'],
  [/in\.|"/, 'inch', 'inches'],
  [/hrs?/, 'hour', 'hours'],
  [/mins?/, 'minute', 'minutes'],
  [/secs?/, 'second', 'seconds'],
  [/pkgs?/, 'package', 'packages'],
];

const FRACTION_CHARS: Record<string, string> = { '½': '1/2', '¼': '1/4', '¾': '3/4', '⅓': '1/3', '⅔': '2/3', '⅛': '1/8' };
const DENOMINATORS = ['', '', 'half', 'third', 'quarter', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth',
  'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth'];

/** "3/4" -> "three quarters", "1/2" -> "one half"; null for odd ones like "7/100". */
function fractionWords(f: string): string | null {
  const [a, b] = f.split('/').map(Number);
  const den = DENOMINATORS[b];
  if (!den || a > 99) return null;
  return `${words(a)} ${a === 1 ? den : den === 'half' ? 'halves' : `${den}s`}`;
}

// A quantity: "150", "1.5", "1/2", "1 1/2", or a range like "20-25".
const NUM = String.raw`\d+(?:[.,]\d+)?(?:\s+\d+\/\d+)?(?:\/\d+)?`;
const QTY = String.raw`(${NUM}(?:\s*(?:-|–|to)\s*${NUM})?)`;

/** True when a quantity reads as one or less ("1", "1/2", "0.5"), so the unit stays singular. */
function singular(qty: string): boolean {
  const last = qty.split(/\s*(?:-|–|to)\s*/).pop()!.trim();
  if (/\s/.test(last)) return false; // "1 1/2"
  const [a, b] = last.replace(',', '.').split('/').map(Number);
  return (b ? a / b : a) <= 1;
}

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** 150 -> "one hundred and fifty", 2500 -> "two thousand five hundred". */
function words(n: number): string {
  if (!Number.isFinite(n) || n >= 1e12) return String(n);
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '');
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} hundred` + (n % 100 ? ` and ${words(n % 100)}` : '');
  for (const [size, name] of [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']] as const) {
    if (n >= size) {
      const rest = n % size;
      return `${words(Math.floor(n / size))} ${name}` + (rest ? (rest < 100 ? ` and ${words(rest)}` : ` ${words(rest)}`) : '');
    }
  }
  return String(n);
}

export function spoken(input: string): string {
  // "1,000" -> "1000" (a comma between digits in a recipe is a thousands separator)
  let s = input.replace(/(\d),(\d{3})(?!\d)/g, '$1$2');

  // "1½" / "½" -> "1 1/2" / "1/2"
  s = s.replace(/(\d)?([½¼¾⅓⅔⅛])/g, (_, d, f) => (d ? `${d} ` : '') + FRACTION_CHARS[f]);

  // Temperatures: "180°C", "350 °F", "350F"
  s = s.replace(new RegExp(String.raw`${QTY}\s*°\s*([CF])\b`, 'g'), (_, q, u) => `${q} degrees ${u === 'C' ? 'Celsius' : 'Fahrenheit'}`);
  s = s.replace(new RegExp(String.raw`${QTY}\s?([CF])\b`, 'g'), (_, q, u) => `${q} degrees ${u === 'C' ? 'Celsius' : 'Fahrenheit'}`);
  s = s.replace(/°/g, ' degrees');

  // Units right after a quantity: "150g", "2 tbsp", "20-25 mins"
  for (const [pattern, one, many] of UNITS) {
    const re = new RegExp(String.raw`${QTY}\s?(?:${pattern.source})(?![A-Za-z])`, 'g');
    s = s.replace(re, (_, q: string) => `${q} ${singular(q) ? one : many}`);
  }

  // Ranges: "20-25" -> "20 to 25"
  s = s.replace(/(\d)\s*[-–]\s*(\d)/g, '$1 to $2');

  // Fractions: "1 1/2" -> "1 and one half", "1/2" -> "one half"
  s = s.replace(/(\d+)\s+(\d+\/\d+)/g, (m, w, f) => (fractionWords(f) ? `${w} and ${fractionWords(f)}` : m));
  s = s.replace(/(?<![\d/])(\d+\/\d+)(?![\d/])/g, (m, f) => fractionWords(f) ?? m.replace('/', ' over '));

  // "x2" / "2x" as in "repeat 2x"
  s = s.replace(/\b(\d+)\s?x\b/g, '$1 times');

  // Spell out every number: "150" -> "one hundred and fifty", "0.5" -> "zero point five", "2:30" -> "two thirty"
  s = s.replace(/\b(\d{1,2}):(\d{2})\b/g, (_, h, m) => `${words(+h)} ${m === '00' ? "o'clock" : m[0] === '0' ? `oh ${words(+m)}` : words(+m)}`);
  s = s.replace(/\d+(?:\.\d+)?/g, (n) => {
    const [whole, frac] = n.split('.');
    const w = words(Number(whole));
    return frac ? `${w} point ${[...frac].map((d) => ONES[+d]).join(' ')}` : w;
  });

  return s.replace(/\s{2,}/g, ' ').trim();
}
