import { youtubeId } from './ranking';

export type VideoText = { title: string; description: string; transcript: string };

type CaptionTrack = { baseUrl: string; languageCode?: string; kind?: string };

/**
 * Read a YouTube video's title, description and transcript from this device.
 * YouTube blocks cloud servers (like Supabase's) from reading these, but
 * answers phones normally, so the app fetches them and sends them along.
 * The transcript comes back as "[seconds] words" lines so each recipe step
 * can link to the moment it happens.
 * Returns null quickly when it can't (e.g. in a web browser, which blocks
 * cross-site requests to YouTube).
 */
export async function fetchVideoText(url: string): Promise<VideoText | null> {
  const videoId = youtubeId(url);
  if (!videoId) return null;
  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId, context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38', hl: 'en' } } }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const tracks: CaptionTrack[] = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
    const track =
      tracks.find((t) => t.languageCode?.startsWith('en') && t.kind !== 'asr') ??
      tracks.find((t) => t.languageCode?.startsWith('en')) ??
      tracks[0];
    return {
      title: data?.videoDetails?.title ?? '',
      description: data?.videoDetails?.shortDescription ?? '',
      transcript: track ? await fetchTranscript(track.baseUrl) : '',
    };
  } catch {
    return null;
  }
}

async function fetchTranscript(baseUrl: string): Promise<string> {
  try {
    const res = await fetch(`${baseUrl}&fmt=json3`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return '';
    const data = (await res.json()) as { events?: { tStartMs?: number; segs?: { utf8: string }[] }[] };
    // One line per caption: "[73] now add the garlic"
    return (data.events ?? [])
      .filter((e) => e.segs?.length)
      .map((e) => `[${Math.round((e.tStartMs ?? 0) / 1000)}] ${e.segs!.map((s) => s.utf8).join('').replace(/\s+/g, ' ').trim()}`)
      .filter((l) => !/\]\s*$/.test(l))
      .join('\n');
  } catch {
    return '';
  }
}

/** 135 -> "2:15" */
export function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Link to a moment in the video. */
export function youtubeAt(url: string, seconds: number): string {
  const id = youtubeId(url);
  return id ? `https://www.youtube.com/watch?v=${id}&t=${Math.max(0, Math.floor(seconds))}s` : url;
}
