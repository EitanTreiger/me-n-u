// One-off: rewrite the starter recipes' steps so every cooking step says the
// heat level or oven temperature and how long, then save them to the
// database and to starter-recipes.txt.
//   GEMINI_API_KEY=... SUPABASE_ACCESS_TOKEN=... node supabase/seed/add-cooking-details.mts
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PROJECT = 'pmldwxwvowvkjxumgmfy';
const MODELS = ['gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-flash-latest'];

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

type Row = { title: string; ingredients: { name: string; quantity: number; unit: string }[]; steps: string[] };

async function rewrite(batch: Row[]): Promise<{ title: string; steps: string[] }[]> {
  const prompt = `Rewrite the steps of each recipe below so a beginner cook knows exactly what to do.
Every step that involves heat must say the heat level (low, medium, medium-high, high) or the oven temperature in both °F and °C (e.g. "350°F (175°C)"), and how long, with a doneness cue where helpful (e.g. "until golden, about 5 minutes").
Keep the same method and roughly the same number of steps. Do not number the steps. Return every recipe, with the exact same title.

${JSON.stringify(batch.map((r) => ({ title: r.title, ingredients: r.ingredients.map((i) => [i.quantity || '', i.unit, i.name].filter(Boolean).join(' ')), steps: r.steps })))}`;
  for (const model of MODELS) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY! },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingLevel: 'low' },
          responseJsonSchema: {
            type: 'array',
            items: {
              type: 'object',
              required: ['title', 'steps'],
              properties: { title: { type: 'string' }, steps: { type: 'array', items: { type: 'string' } } },
            },
          },
        },
      }),
      signal: AbortSignal.timeout(120_000),
    }).catch(() => null);
    if (!res?.ok) {
      console.log(`  ${model}: ${res?.status ?? 'timeout'}, trying next`);
      continue;
    }
    const data = await res.json();
    const text = (data.candidates?.[0]?.content?.parts ?? []).filter((p: { thought?: boolean }) => !p.thought).map((p: { text: string }) => p.text).join('');
    return JSON.parse(text);
  }
  throw new Error('all models busy');
}

const rows: Row[] = await sql('select title, ingredients, steps from recipes order by created_at');
const updated = new Map<string, string[]>();
for (let i = 0; i < rows.length; i += 10) {
  const batch = rows.slice(i, i + 10);
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const out = await rewrite(batch);
      for (const r of out) if (batch.some((b) => b.title === r.title) && r.steps.length) updated.set(r.title, r.steps);
      console.log(`batch ${i / 10 + 1}: ${out.length} recipes`);
      break;
    } catch (e) {
      console.log(`batch ${i / 10 + 1} attempt ${attempt} failed: ${(e as Error).message}`);
      await new Promise((r) => setTimeout(r, 15_000));
    }
  }
}

if (updated.size) {
  await sql(
    [...updated]
      .map(([title, steps]) => `update recipes set steps = ARRAY[${steps.map(lit).join(', ')}]::text[] where title = ${lit(title)};`)
      .join('\n'),
  );
}

// Keep the seed file in sync.
const file = join(here, 'starter-recipes.txt');
const lines = readFileSync(file, 'utf8').split('\n').map((line) => {
  if (!line.trim() || line.startsWith('#')) return line;
  const cols = line.split('|');
  const steps = updated.get(cols[0].trim());
  if (!steps) return line;
  cols[7] = ' ' + steps.map((s) => s.replace(/[;|]/g, ',')).join('; ');
  return cols.join('|');
});
writeFileSync(file, lines.join('\n'));
console.log(`updated ${updated.size} of ${rows.length} recipes`);
