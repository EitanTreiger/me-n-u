import { youtubeId } from './ranking';

export type VideoText = { title: string; description: string };

/**
 * Read a YouTube video's title and description from this device.
 * YouTube blocks cloud servers (like Supabase's) from reading descriptions,
 * but answers phones normally, so the app fetches it and sends it along.
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
    const description: string | undefined = data?.videoDetails?.shortDescription;
    return description ? { title: data.videoDetails.title ?? '', description } : null;
  } catch {
    return null;
  }
}
