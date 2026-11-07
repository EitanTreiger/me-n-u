// Supabase Edge Function: convert a recipe photo or a YouTube video into a
// structured recipe using Claude.
//
// POST { "imageBase64": "...", "mediaType": "image/jpeg" }
//   or { "youtubeUrl": "https://www.youtube.com/watch?v=..." }
// -> { "recipe": { title, description, servings, total_minutes, ingredients, steps, dietary_tags } }
//
// Requires the ANTHROPIC_API_KEY secret:
//   npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

import Anthropic from "npm:@anthropic-ai/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DIETARY_TAGS = [
  "vegetarian",
  "vegan",
  "gluten-free",
  "dairy-free",
  "nut-free",
  "halal",
  "kosher",
  "low-sodium",
  "diabetic-friendly",
] as const;

const recipeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["is_recipe", "title", "description", "servings", "total_minutes", "ingredients", "steps", "dietary_tags"],
  properties: {
    is_recipe: {
      type: "boolean",
      description: "false if the input does not contain a recipe or a dish that can be described as one",
    },
    title: { type: "string" },
    description: { type: "string", description: "One or two friendly sentences describing the dish" },
    servings: { type: "integer", description: "Number of servings, 0 if unknown" },
    total_minutes: { type: "integer", description: "Total prep + cook time in minutes, 0 if unknown" },
    ingredients: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "quantity", "unit"],
        properties: {
          name: { type: "string", description: "Plain ingredient name, lowercase, singular, no quantity, e.g. 'yellow onion'" },
          quantity: { type: "number", description: "Numeric amount, 0 if unspecified (e.g. 'salt to taste')" },
          unit: { type: "string", description: "Unit like cup, tbsp, tsp, g, kg, ml, l, lb, oz, clove, can; empty string for countable items" },
        },
      },
    },
    steps: { type: "array", items: { type: "string" }, description: "Clear, numbered-order instructions without the numbers" },
    dietary_tags: { type: "array", items: { type: "string", enum: [...DIETARY_TAGS] } },
  },
} as const;

const SYSTEM_PROMPT = `You turn cooking content into clean, structured recipes for staff and residents of group homes.
Write in plain, friendly language that is easy to follow. Keep the author's ingredients and method; do not invent steps that are not supported by the source, but you may fill in obvious gaps (like "preheat the oven") when the source clearly implies them.
Only add a dietary tag when the ingredient list clearly supports it.
If the input is a photo of a finished dish with no written recipe, set is_recipe to true only if you can confidently identify the dish, and give a simple, standard home version of it.`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
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

type VideoInfo = { title: string; description: string; transcript: string };

// Fetch title, description and captions using YouTube's public player API.
async function fetchYoutube(videoId: string): Promise<VideoInfo> {
  const playerRes = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      videoId,
      context: { client: { clientName: "ANDROID", clientVersion: "20.10.38", hl: "en" } },
    }),
  });
  if (!playerRes.ok) throw new Error(`YouTube responded ${playerRes.status}`);
  const player = await playerRes.json();

  const title: string = player?.videoDetails?.title ?? "";
  const description: string = player?.videoDetails?.shortDescription ?? "";

  let transcript = "";
  const tracks: { baseUrl: string; languageCode: string; kind?: string }[] =
    player?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  const track =
    tracks.find((t) => t.languageCode?.startsWith("en") && t.kind !== "asr") ??
    tracks.find((t) => t.languageCode?.startsWith("en")) ??
    tracks[0];
  if (track?.baseUrl) {
    try {
      const capRes = await fetch(`${track.baseUrl}&fmt=json3`);
      if (capRes.ok) {
        const cap = await capRes.json();
        transcript = (cap?.events ?? [])
          .flatMap((e: { segs?: { utf8: string }[] }) => e.segs ?? [])
          .map((s: { utf8: string }) => s.utf8)
          .join("")
          .replace(/\s+/g, " ")
          .trim();
      }
    } catch {
      // Captions are optional; description often has the recipe.
    }
  }

  if (!title && !description && !transcript) {
    throw new Error("Couldn't read that video. Check the link, or try a different video.");
  }
  return { title, description, transcript };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "ANTHROPIC_API_KEY is not set on the server" }, 500);

  let body: { imageBase64?: string; mediaType?: string; youtubeUrl?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  let videoTitle = "";

  if (body.imageBase64) {
    const mediaType = (body.mediaType ?? "image/jpeg") as "image/jpeg" | "image/png" | "image/webp" | "image/gif";
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mediaType)) {
      return json({ error: "Unsupported image type" }, 400);
    }
    content.push({ type: "image", source: { type: "base64", media_type: mediaType, data: body.imageBase64 } });
    content.push({
      type: "text",
      text: "This is a photo of a recipe (a cookbook page, recipe card, handwritten note, screenshot) or of a dish. Extract the recipe.",
    });
  } else if (body.youtubeUrl) {
    const id = youtubeId(body.youtubeUrl);
    if (!id) return json({ error: "That doesn't look like a YouTube link" }, 400);
    let info: VideoInfo;
    try {
      info = await fetchYoutube(id);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : "Couldn't read that video" }, 422);
    }
    videoTitle = info.title;
    content.push({
      type: "text",
      text: [
        "Extract the recipe from this cooking video.",
        `<video_title>${info.title}</video_title>`,
        `<video_description>${info.description}</video_description>`,
        `<transcript>${info.transcript || "(no captions available)"}</transcript>`,
      ].join("\n"),
    });
  } else {
    return json({ error: "Send imageBase64 or youtubeUrl" }, 400);
  }

  const client = new Anthropic({ apiKey });

  try {
    const stream = client.beta.messages.stream({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      // Re-run on Anthropic's recommended model if a safety classifier declines.
      // @ts-expect-error: `fallbacks: "default"` is newer than the SDK typings
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: recipeSchema },
      },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    });
    const message = await stream.finalMessage();

    if (message.stop_reason === "refusal") {
      return json({ error: "That content couldn't be converted. Try another photo or video." }, 422);
    }
    if (message.stop_reason === "max_tokens") {
      return json({ error: "The recipe was too long to convert. Try a shorter source." }, 422);
    }

    const text = message.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const parsed = JSON.parse(text);

    if (!parsed.is_recipe) {
      return json({ error: "We couldn't find a recipe in that. Try a clearer photo or a different video." }, 422);
    }
    if (!parsed.title && videoTitle) parsed.title = videoTitle;
    delete parsed.is_recipe;
    return json({ recipe: parsed });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      return json({ error: "The converter is busy right now. Try again in a minute." }, 429);
    }
    if (e instanceof Anthropic.APIError) {
      console.error("Anthropic API error", e.status, e.message);
      return json({ error: "The converter had a problem. Try again." }, 502);
    }
    console.error(e);
    return json({ error: "Something went wrong converting that recipe." }, 500);
  }
});
