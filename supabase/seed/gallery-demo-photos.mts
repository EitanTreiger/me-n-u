// Demo content: one extra photo from Wikimedia Commons (freely licensed) for
// 15 well-known recipes, picked by Gemini so it really shows the dish and is
// different from the recipe's main photo. Writes the picks to a JSON file;
// add --insert to add them to the recipe photo gallery.
//   GEMINI_API_KEY=... SUPABASE_ACCESS_TOKEN=... node supabase/seed/gallery-demo-photos.mts [--insert]
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT = 'pmldwxwvowvkjxumgmfy';
const UA = { 'User-Agent': 'me-n-u/1.0 (recipe sharing app prototype)', 'Api-User-Agent': 'me-n-u/1.0 (recipe sharing app prototype)' };
const TITLES = [
  'Spaghetti Bolognese', 'Margherita Pizza', 'Pad Thai', 'Butter Chicken', 'Chicken Tacos', 'Guacamole', 'Pho',
  'Bibimbap', 'Falafel', 'Greek Salad', 'Paella', 'Pancakes', 'Fish and Chips', 'Lasagna', 'Shakshuka',
];

async function sql(query: string) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`SQL ${res.status}: ${await res.text()}`);
  return res.json();
}

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
const fileOf = (url: string | null) => decodeURIComponent((url ?? '').split('/').pop() ?? '').replace(/^\d+px-/, '');

async function commons(query: string): Promise<{ url: string; page: string }[]> {
  const params = new URLSearchParams({
    action: 'query', format: 'json', generator: 'search', gsrnamespace: '6',
    gsrsearch: `${query} filetype:bitmap`, gsrlimit: '8', prop: 'imageinfo', iiprop: 'url', iiurlwidth: '640',
  });
  const data = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { headers: UA }).then((r) => r.json());
  return Object.values(data.query?.pages ?? {})
    .sort((a: any, b: any) => a.index - b.index)
    .map((p: any) => ({ url: p.imageinfo?.[0]?.thumburl, page: p.imageinfo?.[0]?.descriptionurl }))
    .filter((c) => c.url);
}

async function load(url: string) {
  const res = await fetch(url, { headers: UA });
  const mime = res.headers.get('content-type') ?? '';
  if (!res.ok || !mime.startsWith('image/')) return null;
  return { mime: mime.split(';')[0], data: Buffer.from(await res.arrayBuffer()).toString('base64') };
}

async function pick(title: string, candidates: { url: string; page: string }[]) {
  const loaded = (await Promise.all(candidates.map(async (c) => ({ c, img: await load(c.url) })))).filter((x) => x.img);
  if (!loaded.length) return null;
  const parts: object[] = [];
  loaded.forEach((x, i) => parts.push({ text: `Image ${i}:` }, { inline_data: { mime_type: x.img!.mime, data: x.img!.data } }));
  parts.push({ text: `Which image is the best appetising photo of the finished dish "${title}"? It must clearly show this dish (not raw ingredients, a different dish, people, a menu or a logo). Answer -1 if none fit.` });
  for (const model of ['gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-flash-latest']) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY! },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingLevel: 'low' },
          responseJsonSchema: { type: 'object', required: ['best'], properties: { best: { type: 'integer' } } },
        },
      }),
    }).catch(() => null);
    if (!res?.ok) continue;
    const data = await res.json();
    const text = (data.candidates?.[0]?.content?.parts ?? []).filter((p: any) => !p.thought).map((p: any) => p.text).join('');
    const best = Number(JSON.parse(text).best);
    return best >= 0 && best < loaded.length ? loaded[best].c : null;
  }
  return null;
}

const rows: { id: string; title: string; image_url: string | null }[] = await sql(
  `select id, title, image_url from recipes where title in (${TITLES.map(lit).join(', ')})`,
);
const picks: { recipe_id: string; title: string; url: string; source: string }[] = [];
for (const r of rows) {
  const current = fileOf(r.image_url);
  const candidates = (await commons(r.title)).filter((c) => fileOf(c.url) !== current).slice(0, 6);
  const chosen = await pick(r.title, candidates);
  console.log(`${r.title}: ${chosen ? fileOf(chosen.url) : 'no good photo'}`);
  if (chosen) picks.push({ recipe_id: r.id, title: r.title, url: chosen.url, source: chosen.page });
}

const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(here, 'gallery-demo-photos.json'), JSON.stringify(picks, null, 2));
console.log(`${picks.length} photos picked`);

if (process.argv.includes('--insert') && picks.length) {
  // Added as the app owner's photos, credited to the first home (posters show only as their home).
  const owner = (await sql(`select id from profiles order by created_at limit 1`))[0].id;
  await sql(
    `insert into recipe_gallery (recipe_id, user_id, photo_path, home_id, home_name) select v.r::uuid, v.u::uuid, v.p, h.id, h.name from (values ${picks
      .map((p) => `(${lit(p.recipe_id)}, ${lit(owner)}, ${lit(p.url)})`)
      .join(', ')}) v(r, u, p), (select id, name from homes order by created_at limit 1) h;`,
  );
  console.log('inserted into recipe_gallery');
}
