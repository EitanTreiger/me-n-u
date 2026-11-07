// Supabase Edge Function: convert a recipe photo or a YouTube video into a
// structured recipe using Google Gemini.
//
// POST { "imageBase64": "...", "mediaType": "image/jpeg" }
//   or { "youtubeUrl": "https://www.youtube.com/watch?v=..." }
// -> { "recipe": { title, description, servings, total_minutes, ingredients, steps, dietary_tags } }
//
// Gemini watches YouTube videos directly (speech, on-screen text and what the
// cook does), so videos without captions work too. Public videos only.
//
// Requires the GEMINI_API_KEY secret (Supabase -> Edge Functions -> Secrets).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Tried in order; the next one is used when a model is busy or unavailable.
// gemini-3.6-flash answered fastest and most reliably in testing (10 s for a
// 6-minute video); the newer 3.8 was often overloaded.
const MODELS = ['gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-flash-latest'];

// Supabase stops functions after ~150 s; leave room for a retry.
const PER_CALL_TIMEOUT_MS = 50_000;
const TOTAL_BUDGET_MS = 135_000;

const DIETARY_TAGS = [
  'vegetarian',
  'vegan',
  'gluten-free',
  'dairy-free',
  'nut-free',
  'halal',
  'kosher',
  'low-sodium',
  'diabetic-friendly',
];

const recipeSchema = {
  type: 'object',
  required: ['is_recipe', 'title', 'description', 'servings', 'total_minutes', 'ingredients', 'steps', 'step_times', 'dietary_tags'],
  properties: {
    is_recipe: {
      type: 'boolean',
      description: 'false if the input does not contain a recipe or a dish that can be described as one',
    },
    title: { type: 'string' },
    description: { type: 'string', description: 'One or two friendly sentences describing the dish' },
    servings: { type: 'integer', description: 'Number of servings, 0 if unknown' },
    total_minutes: { type: 'integer', description: 'Total prep + cook time in minutes, 0 if unknown' },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'quantity', 'unit'],
        properties: {
          name: { type: 'string', description: "Plain ingredient name, lowercase, no quantity, e.g. 'yellow onion'" },
          quantity: { type: 'number', description: "Numeric amount, 0 if unspecified (e.g. 'salt to taste')" },
          unit: {
            type: 'string',
            description: 'One of cup, tbsp, tsp, g, kg, ml, l, lb, oz, clove, can, slice, pinch; empty string for countable items like eggs or onions',
          },
        },
      },
    },
    steps: { type: 'array', items: { type: 'string' }, description: 'Clear instructions in order, without numbers' },
    step_times: {
      type: 'array',
      items: { type: 'integer' },
      description:
        'One entry per step: the second in the video where that step is shown or explained. -1 for every step when the source is not a video, or when unknown.',
    },
    dietary_tags: { type: 'array', items: { type: 'string', enum: DIETARY_TAGS } },
  },
};

const receiptSchema = {
  type: 'object',
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'quantity', 'unit'],
        properties: {
          name: { type: 'string', description: "Plain food name a recipe would use, lowercase, e.g. 'eggs', 'cheddar cheese', 'chicken breast'" },
          quantity: { type: 'number', description: 'How many / how much was bought; 0 if unclear' },
          unit: { type: 'string', description: 'g, kg, ml, l, lb, oz, can, or empty string for countable items like eggs or apples' },
        },
      },
    },
  },
};

const SYSTEM_PROMPT = `You turn cooking content into clean, structured recipes for staff and residents of group homes.
Write in plain, friendly language that is easy to follow. Keep the author's ingredients and method; do not invent steps that are not supported by the source, but you may fill in obvious gaps (like "preheat the oven") when the source clearly implies them.
For videos, use what is said, any text shown on screen, and what you can see being added. Estimate amounts you can clearly see but that are not stated, and use 0 when you cannot tell.
Every cooking step should say the heat level or oven temperature (°F with °C) and roughly how long, when the source says or clearly shows it.
For videos and transcripts, give each step the time (in seconds from the start) where it happens, using the [seconds] markers in the transcript.
Only add a dietary tag when the ingredient list clearly supports it.
If the input is a photo of a finished dish with no written recipe, set is_recipe to true only if you can confidently identify the dish, and give a simple, standard home version of it.`;

const RECEIPT_PROMPT = `This is a photo of a grocery receipt or a shopping list. List the food and cooking items on it, with how many or how much of each.
Turn store abbreviations into plain names ("GRN ONION" -> "green onions", "LG EGGS 12CT" -> 12 eggs). Skip non-food items, bags, taxes, totals and discounts.`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function youtubeId(url: string): string | null {
  const patterns = [
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtube\.com\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

type VideoText = { title: string; description: string };

/** Title + description from YouTube's player API, falling back to the watch page. */
async function fetchVideoText(videoId: string): Promise<VideoText | null> {
  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId, context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38', hl: 'en' } } }),
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) {
      const data = await res.json();
      const description = data?.videoDetails?.shortDescription;
      if (description) return { title: data.videoDetails.title ?? '', description };
    }
  } catch {
    // fall through to the watch page
  }
  try {
    const html = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en' },
      signal: AbortSignal.timeout(8_000),
    }).then((r) => r.text());
    const desc = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/)?.[1];
    const title = html.match(/<title>(.*?)(?: - YouTube)?<\/title>/)?.[1] ?? '';
    if (desc) return { title, description: JSON.parse(`"${desc}"`) };
  } catch {
    // no description available
  }
  return null;
}

/** Cheap check before asking the model: does the description list ingredients? */
function descriptionHasRecipe(description: string): boolean {
  if (/ingredients?\s*:?/i.test(description)) return true;
  const amountLines = description
    .split('\n')
    .filter((l) => /^\s*[-•*]?\s*(\d|½|¼|¾|⅓|⅔)/.test(l) && /[a-z]{3,}/i.test(l));
  return amountLines.length >= 3;
}

class UserFacingError extends Error {
  constructor(message: string, public status = 422) {
    super(message);
  }
}

type Part = Record<string, unknown>;

async function callGemini(
  apiKey: string,
  parts: Part[],
  isVideo: boolean,
  { schema = recipeSchema as object, system = SYSTEM_PROMPT } = {},
): Promise<Record<string, unknown>> {
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseJsonSchema: schema,
      // Low thinking + low video resolution keeps a 6-minute video to ~25 s.
      thinkingConfig: { thinkingLevel: 'low' },
      ...(isVideo ? { mediaResolution: 'MEDIA_RESOLUTION_LOW' } : {}),
    },
  };

  const started = Date.now();
  let lastProblem = 'The converter is busy right now. Try again in a minute.';

  for (const model of MODELS) {
    const remaining = TOTAL_BUDGET_MS - (Date.now() - started);
    if (remaining < 15_000) break;

    let res: Response;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(Math.min(PER_CALL_TIMEOUT_MS, remaining)),
      });
    } catch (e) {
      console.error(`${model}: request failed`, e);
      lastProblem = 'The converter is slow right now. Try again in a minute, or pick a video that lists the recipe in its description.';
      continue;
    }

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const message: string = data?.error?.message ?? `HTTP ${res.status}`;
      console.error(`${model}: ${res.status} ${message}`);
      // Busy, rate limited, or this model isn't offered: try the next one.
      if ([429, 500, 503, 504].includes(res.status) || /no longer available|not found/i.test(message)) continue;
      if (/video|youtube|file/i.test(message)) {
        throw new UserFacingError("Couldn't open that video. Make sure it's public and not age-restricted.");
      }
      throw new UserFacingError('The converter had a problem. Try again.', 502);
    }

    const candidate = data?.candidates?.[0];
    if (!candidate || candidate.finishReason === 'SAFETY' || data?.promptFeedback?.blockReason) {
      throw new UserFacingError("That content couldn't be converted. Try another photo or video.");
    }
    if (candidate.finishReason === 'MAX_TOKENS') {
      throw new UserFacingError('The recipe was too long to convert. Try a shorter source.');
    }
    const text = (candidate.content?.parts ?? [])
      .filter((p: { text?: string; thought?: boolean }) => p.text && !p.thought)
      .map((p: { text: string }) => p.text)
      .join('');
    try {
      return JSON.parse(text);
    } catch {
      console.error(`${model}: unparseable output`, text.slice(0, 300));
      lastProblem = 'The converter had a problem. Try again.';
      continue;
    }
  }
  throw new UserFacingError(lastProblem, 503);
}

// ---------------------------------------------------------------------------
// Dish photo picker: gather candidate photos online, let Gemini look at them
// and choose the one that actually shows the dish.
// ---------------------------------------------------------------------------

const UA = { 'User-Agent': 'me-n-u/1.0 (recipe sharing app prototype)', 'Api-User-Agent': 'me-n-u/1.0 (recipe sharing app prototype)' };

async function mealDbCandidates(query: string): Promise<string[]> {
  try {
    const res = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(query)}`, {
      signal: AbortSignal.timeout(6000),
    });
    const data = await res.json();
    return (data.meals ?? []).slice(0, 4).map((m: { strMealThumb: string }) => `${m.strMealThumb}/preview`);
  } catch {
    return [];
  }
}

async function wikipediaCandidates(query: string): Promise<string[]> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrsearch: `${query} dish`,
    gsrlimit: '5',
    prop: 'pageimages',
    piprop: 'thumbnail',
    pithumbsize: '330',
  });
  try {
    const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, { headers: UA, signal: AbortSignal.timeout(6000) });
    const data = await res.json();
    return Object.values(data.query?.pages ?? {})
      .sort((a, b) => (a as { index: number }).index - (b as { index: number }).index)
      .map((p) => (p as { thumbnail?: { source: string } }).thumbnail?.source)
      .filter((s): s is string => !!s && !/\.svg/i.test(s));
  } catch {
    return [];
  }
}

/** Lead photo of the Wikipedia article named exactly after the dish. */
async function wikipediaArticleImage(title: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}?redirect=true`,
      { headers: UA, signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const src: string | undefined = data?.thumbnail?.source;
    return data?.type === 'standard' && src && !/\.svg/i.test(src) ? [src] : [];
  } catch {
    return [];
  }
}

/** Photos from Wikimedia Commons, Wikipedia's free media library. */
async function commonsCandidates(query: string): Promise<string[]> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrnamespace: '6',
    gsrsearch: `${query} filetype:bitmap`,
    gsrlimit: '5',
    prop: 'imageinfo',
    iiprop: 'url',
    iiurlwidth: '330',
  });
  try {
    const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { headers: UA, signal: AbortSignal.timeout(6000) });
    const data = await res.json();
    return Object.values(data.query?.pages ?? {})
      .sort((a, b) => (a as { index: number }).index - (b as { index: number }).index)
      .map((p) => (p as { imageinfo?: { thumburl?: string }[] }).imageinfo?.[0]?.thumburl)
      .filter((s): s is string => !!s);
  } catch {
    return [];
  }
}

async function loadImage(url: string): Promise<{ url: string; data: string; mime: string } | null> {
  try {
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(6000) });
    const mime = res.headers.get('content-type') ?? '';
    if (!res.ok || !mime.startsWith('image/') || mime.includes('svg')) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > 1_500_000) return null;
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { url, data: btoa(binary), mime: mime.split(';')[0] };
  } catch {
    return null;
  }
}

async function pickDishImage(apiKey: string, title: string, description: string, current?: string): Promise<{ url: string | null; candidates: number; loaded: number }> {
  const shortTitle = title.split(/\s+/).slice(-2).join(' ');
  const lists = await Promise.all([
    wikipediaArticleImage(title),
    commonsCandidates(title),
    mealDbCandidates(title),
    wikipediaCandidates(title),
    shortTitle !== title ? wikipediaArticleImage(shortTitle) : Promise.resolve([]),
  ]);
  // Take a few from each source so no single source crowds out the rest.
  const [article, commons, mealdb, wiki, articleShort] = lists;
  const urls = [
    ...new Set([
      ...(current ? [current] : []),
      ...article,
      ...articleShort,
      ...commons.slice(0, 4),
      ...mealdb.slice(0, 2),
      ...wiki.slice(0, 2),
    ]),
  ].slice(0, 10);
  const images = (await Promise.all(urls.map(loadImage))).filter((i): i is NonNullable<typeof i> => !!i);
  if (!images.length) return null;

  const parts: Part[] = [];
  images.forEach((img, i) => {
    parts.push({ text: `Image ${i}:` });
    parts.push({ inline_data: { mime_type: img.mime, data: img.data } });
  });
  parts.push({
    text: `Which image is the best appetising photo of the finished dish "${title}"${description ? ` (${description})` : ''}? It must clearly show this dish (not a raw ingredient, a different dish, a person, a map or a logo). Answer -1 if none fit.`,
  });
  const out = await callGemini(apiKey, parts, false, {
    schema: { type: 'object', required: ['best'], properties: { best: { type: 'integer' } } },
    system: 'You choose food photos for a recipe app. Be strict: only pick an image that clearly shows the named dish.',
  });
  const best = Number(out.best);
  return { url: best >= 0 && best < images.length ? images[best].url : null, candidates: urls.length, loaded: images.length };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) return json({ error: 'GEMINI_API_KEY is not set on the server' }, 500);

  let body: {
    imageBase64?: string;
    mediaType?: string;
    youtubeUrl?: string;
    title?: string;
    description?: string;
    transcript?: string;
    text?: string;
    receiptBase64?: string;
    pickImage?: string;
    currentUrl?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  // Find a photo of a dish: { pickImage: title, description?, currentUrl? } -> { url }
  if (body.pickImage) {
    try {
      return json(await pickDishImage(apiKey, body.pickImage, body.description ?? '', body.currentUrl));
    } catch (e) {
      console.error('image pick failed', e);
      return json({ url: null, error: e instanceof Error ? e.message : 'failed' });
    }
  }

  // Receipt or shopping list photo -> pantry items.
  if (body.receiptBase64) {
    try {
      const out = await callGemini(
        apiKey,
        [
          { inline_data: { mime_type: body.mediaType ?? 'image/jpeg', data: body.receiptBase64 } },
          { text: 'List the food items on this receipt or shopping list.' },
        ],
        false,
        { schema: receiptSchema, system: RECEIPT_PROMPT },
      );
      return json({ items: out.items ?? [] });
    } catch (e) {
      if (e instanceof UserFacingError) return json({ error: e.message }, e.status);
      return json({ error: "Couldn't read that receipt. Try a clearer photo." }, 500);
    }
  }

  const parts: Part[] = [];
  let isVideo = false;

  if (body.text) {
    // Recipe pasted from a website, email or document.
    if (body.text.length > 50_000) return json({ error: 'That text is too long. Paste just the recipe.' }, 400);
    parts.push({
      text: [
        'Extract the recipe from this pasted text. It may include extra website text, ads or comments: ignore anything that is not part of the recipe.',
        `<pasted_text>${body.text}</pasted_text>`,
      ].join('\n'),
    });
  } else if (body.imageBase64) {
    const mediaType = body.mediaType ?? 'image/jpeg';
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(mediaType)) {
      return json({ error: 'Unsupported image type' }, 400);
    }
    parts.push({ inline_data: { mime_type: mediaType, data: body.imageBase64 } });
    parts.push({
      text: 'This is a photo of a recipe (a cookbook page, recipe card, handwritten note, screenshot) or of a dish. Extract the recipe.',
    });
  } else if (body.youtubeUrl) {
    const id = youtubeId(body.youtubeUrl);
    if (!id) return json({ error: "That doesn't look like a YouTube link" }, 400);
    // 1. Many cooks put the full recipe in the description: read that first,
    //    which takes a few seconds instead of watching the whole video.
    //    The app sends the description (YouTube blocks this server from
    //    reading it); the server-side fetch is only a fallback.
    const text: VideoText | null = body.description
      ? { title: body.title ?? '', description: body.description }
      : await fetchVideoText(id);
    // The video's own transcript (sent by the app, "[seconds] words" lines)
    // gives the method and a timestamp for each step.
    const transcript = (body.transcript ?? '').slice(0, 120_000);
    if (transcript || (text && descriptionHasRecipe(text.description))) {
      try {
        const fromText = await callGemini(
          apiKey,
          [
            {
              text: [
                transcript
                  ? "Extract the recipe from this YouTube video's transcript, using the description for exact amounts if it lists them. Give each step the [seconds] time where it happens in the transcript."
                  : 'Extract the recipe from this YouTube video description. Use -1 for every step time.',
                `<video_title>${text?.title ?? body.title ?? ''}</video_title>`,
                `<video_description>${text?.description ?? ''}</video_description>`,
                transcript ? `<transcript>${transcript}</transcript>` : '',
              ].join('\n'),
            },
          ],
          false,
        );
        const ingredients = fromText.ingredients as unknown[] | undefined;
        if (fromText.is_recipe && ingredients && ingredients.length >= 2) {
          delete fromText.is_recipe;
          fromText.dietary_tags = ((fromText.dietary_tags as string[]) ?? []).filter((t) => DIETARY_TAGS.includes(t));
          return json({ recipe: fromText, from: transcript ? 'transcript' : 'description' });
        }
      } catch (e) {
        console.error('description pass failed, watching the video instead', e);
      }
    }

    // 2. Otherwise Gemini watches the video.
    isVideo = true;
    parts.push({
      file_data: { file_uri: `https://www.youtube.com/watch?v=${id}` },
      // A frame every 4 s and only the first 10 minutes keeps this inside
      // Supabase's time limit even when Gemini is slow.
      video_metadata: { fps: 0.25, end_offset: '600s' },
    });
    parts.push({ text: 'Extract the recipe from this cooking video. Give each step the time in seconds where it happens in the video.' });
  } else {
    return json({ error: 'Send text, imageBase64 or youtubeUrl' }, 400);
  }

  try {
    const parsed = await callGemini(apiKey, parts, isVideo);
    if (!parsed.is_recipe) {
      return json({ error: "We couldn't find a recipe in that. Try a clearer photo or a different video." }, 422);
    }
    delete parsed.is_recipe;
    parsed.dietary_tags = ((parsed.dietary_tags as string[]) ?? []).filter((t) => DIETARY_TAGS.includes(t));
    return json({ recipe: parsed });
  } catch (e) {
    if (e instanceof UserFacingError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Something went wrong converting that recipe.' }, 500);
  }
});
