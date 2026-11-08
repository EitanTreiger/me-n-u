// Re-check every recipe's online photo with the convert-recipe function's
// Gemini image picker. The current photo is one of the candidates, so it is
// only replaced when Gemini finds a better match.
//   SUPABASE_ACCESS_TOKEN=... SUPABASE_PUBLISHABLE_KEY=... node supabase/seed/check-images.mts
const PROJECT = 'pmldwxwvowvkjxumgmfy';
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;

async function sql(query: string) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`SQL ${res.status}: ${await res.text()}`);
  return res.json();
}

async function pick(title: string, description: string, currentUrl: string | null) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`https://${PROJECT}.supabase.co/functions/v1/convert-recipe`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pickImage: title, description, currentUrl }),
      signal: AbortSignal.timeout(140_000),
    }).catch(() => null);
    const data = res?.ok ? await res.json() : null;
    if (data && !data.error) return data as { url: string | null };
    await new Promise((r) => setTimeout(r, 10_000));
  }
  return null;
}

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
const rows: { id: string; title: string; description: string; image_url: string | null; photo_path: string | null }[] =
  await sql('select id, title, description, image_url, photo_path from recipes where photo_path is null order by title');

let changed = 0;
const noMatch: string[] = [];
const queue = [...rows];
await Promise.all(
  Array.from({ length: 3 }, async () => {
    while (queue.length) {
      const r = queue.shift()!;
      const result = await pick(r.title, r.description.replace(/\s*\([^)]*\)$/, ''), r.image_url);
      if (!result) {
        console.log(`  failed: ${r.title}`);
      } else if (!result.url) {
        noMatch.push(r.title);
        console.log(`  no good photo: ${r.title}`);
      } else if (result.url !== r.image_url) {
        await sql(`update recipes set image_url = ${lit(result.url)} where id = ${lit(r.id)};`);
        changed++;
        console.log(`  replaced: ${r.title}`);
      } else {
        console.log(`  kept: ${r.title}`);
      }
    }
  }),
);
console.log(`\n${rows.length} checked, ${changed} replaced, ${noMatch.length} with no good photo: ${noMatch.join(', ')}`);
