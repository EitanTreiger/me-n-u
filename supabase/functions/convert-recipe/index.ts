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
  required: ['is_recipe', 'title', 'description', 'servings', 'total_minutes', 'ingredients', 'steps', 'dietary_tags'],
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
    dietary_tags: { type: 'array', items: { type: 'string', enum: DIETARY_TAGS } },
  },
};

const SYSTEM_PROMPT = `You turn cooking content into clean, structured recipes for staff and residents of group homes.
Write in plain, friendly language that is easy to follow. Keep the author's ingredients and method; do not invent steps that are not supported by the source, but you may fill in obvious gaps (like "preheat the oven") when the source clearly implies them.
For videos, use what is said, any text shown on screen, and what you can see being added. Estimate amounts you can clearly see but that are not stated, and use 0 when you cannot tell.
Only add a dietary tag when the ingredient list clearly supports it.
If the input is a photo of a finished dish with no written recipe, set is_recipe to true only if you can confidently identify the dish, and give a simple, standard home version of it.`;

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

async function callGemini(apiKey: string, parts: Part[], isVideo: boolean): Promise<Record<string, unknown>> {
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseJsonSchema: recipeSchema,
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) return json({ error: 'GEMINI_API_KEY is not set on the server' }, 500);

  let body: { imageBase64?: string; mediaType?: string; youtubeUrl?: string; title?: string; description?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const parts: Part[] = [];
  let isVideo = false;

  if (body.imageBase64) {
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
    if (text && descriptionHasRecipe(text.description)) {
      try {
        const fromText = await callGemini(
          apiKey,
          [
            {
              text: [
                'Extract the recipe from this YouTube video description.',
                `<video_title>${text.title}</video_title>`,
                `<video_description>${text.description}</video_description>`,
              ].join('\n'),
            },
          ],
          false,
        );
        const ingredients = fromText.ingredients as unknown[] | undefined;
        if (fromText.is_recipe && ingredients && ingredients.length >= 2) {
          delete fromText.is_recipe;
          fromText.dietary_tags = ((fromText.dietary_tags as string[]) ?? []).filter((t) => DIETARY_TAGS.includes(t));
          return json({ recipe: fromText, from: 'description' });
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
    parts.push({ text: 'Extract the recipe from this cooking video.' });
  } else {
    return json({ error: 'Send imageBase64 or youtubeUrl' }, 400);
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
