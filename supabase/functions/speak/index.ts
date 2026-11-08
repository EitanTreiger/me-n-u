// Supabase Edge Function: read a piece of recipe text aloud with ElevenLabs.
//
// POST { "text": "Chop the onion finely." }  ->  { "url": "https://.../tts/<hash>.mp3" }
//
// Each clip is saved in the recipe-photos bucket under tts/, named by a hash of
// the voice, model and text, so the same step is only ever generated once.
//
// Requires the ELEVENLABS_API_KEY secret. ELEVENLABS_VOICE_ID and
// ELEVENLABS_MODEL are optional overrides.

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const VOICE = Deno.env.get('ELEVENLABS_VOICE_ID') || 'JBFqnCBsd6RMkjVDRZzb';
const MODEL = Deno.env.get('ELEVENLABS_MODEL') || 'eleven_flash_v2_5';
const BUCKET = 'recipe-photos';
const MAX_CHARS = 1500;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
  if (!apiKey) return json({ error: 'Read-aloud is not set up yet (missing ElevenLabs key).' }, 500);

  // Only signed-in members of the app may generate audio.
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: user } = await userClient.auth.getUser();
  if (!user.user) return json({ error: 'Please sign in again.' }, 401);

  const { text } = await req.json().catch(() => ({ text: '' }));
  const clean = String(text ?? '').trim().slice(0, MAX_CHARS);
  if (!clean) return json({ error: 'Nothing to read.' }, 400);

  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const path = `tts/${await sha256(`${VOICE}|${MODEL}|${clean}`)}.mp3`;
  const url = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  // Already generated? Reuse it.
  const head = await fetch(url, { method: 'HEAD' }).catch(() => null);
  if (head?.ok) return json({ url });

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text: clean, model_id: MODEL }),
  });
  if (!res.ok) {
    console.error('ElevenLabs', res.status, await res.text());
    return json({ error: res.status === 429 ? 'The voice service is busy. Try again in a moment.' : 'Could not read this step aloud.' }, 502);
  }

  const audio = new Uint8Array(await res.arrayBuffer());
  const { error } = await admin.storage.from(BUCKET).upload(path, audio, { contentType: 'audio/mpeg', upsert: true });
  if (error) {
    console.error('upload', error);
    return json({ error: 'Could not save the audio.' }, 500);
  }
  return json({ url });
});
