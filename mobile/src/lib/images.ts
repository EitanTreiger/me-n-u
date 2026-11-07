// Find a picture of a dish online, for recipes without an uploaded photo.
// 1. TheMealDB: free recipe photos, good for well-known dishes.
// 2. Wikipedia: the lead image of the best-matching article.
// Both are free, need no key and allow requests from the app.

const STOP_WORDS = new Set(['the', 'and', 'with', 'a', 'of', 'classic', 'easy', 'quick', 'homemade', 'simple', 'on', 'in']);

function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/** Share of the title's key words that appear in the candidate name. */
function overlap(title: string, candidate: string): number {
  const t = words(title);
  if (!t.length) return 0;
  const c = new Set(words(candidate));
  return t.filter((w) => c.has(w) || c.has(w.replace(/s$/, ''))).length / t.length;
}

async function fromMealDb(title: string): Promise<string | null> {
  const res = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(title)}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { meals: { strMeal: string; strMealThumb: string }[] | null };
  const best = (data.meals ?? [])
    .map((m) => ({ m, score: overlap(title, m.strMeal) }))
    .sort((a, b) => b.score - a.score)[0];
  return best && best.score >= 0.6 ? best.m.strMealThumb : null;
}

async function fromWikipedia(title: string): Promise<string | null> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrsearch: `${title} food dish`,
    gsrlimit: '3',
    prop: 'pageimages',
    piprop: 'thumbnail',
    pithumbsize: '800',
  });
  // Wikimedia asks API clients to identify themselves.
  const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
    headers: { 'Api-User-Agent': 'me-n-u/1.0 (recipe sharing app prototype)' },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    query?: { pages?: Record<string, { title: string; index: number; thumbnail?: { source: string } }> };
  };
  const pages = Object.values(data.query?.pages ?? {})
    .filter((p) => p.thumbnail?.source && !/\.svg/i.test(p.thumbnail.source))
    .sort((a, b) => a.index - b.index);
  const match = pages.find((p) => overlap(title, p.title) >= 0.5) ?? null;
  return match?.thumbnail?.source ?? null;
}

/**
 * Last resort: the lead image of a Wikipedia article named after the dish,
 * trying shorter endings of the title ("Teriyaki Tofu Stir-Fry" ->
 * "Tofu Stir-Fry" -> "Stir-Fry"), since the last words usually name the dish.
 */
async function fromWikipediaTitle(title: string): Promise<string | null> {
  const parts = title.replace(/^(classic|easy|quick|homemade|simple)\s+/i, '').split(/\s+/);
  for (let start = 0; start < parts.length; start++) {
    const candidate = parts.slice(start).join(' ');
    if (candidate.length < 4 || STOP_WORDS.has(candidate.toLowerCase())) continue;
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(candidate.replace(/ /g, '_'))}?redirect=true`,
      { headers: { 'Api-User-Agent': 'me-n-u/1.0 (recipe sharing app prototype)' } },
    );
    if (!res.ok) continue;
    const data = (await res.json()) as { type?: string; thumbnail?: { source: string } };
    if (data.type === 'standard' && data.thumbnail?.source && !/\.svg/i.test(data.thumbnail.source)) {
      // Use Wikipedia's own thumbnail size: it rejects arbitrary widths.
      return data.thumbnail.source;
    }
  }
  return null;
}

export async function findRecipeImage(title: string): Promise<string | null> {
  for (const source of [fromMealDb, fromWikipedia, fromWikipediaTitle]) {
    try {
      const url = await source(title);
      if (url) return url;
    } catch {
      // try the next source
    }
  }
  return null;
}
