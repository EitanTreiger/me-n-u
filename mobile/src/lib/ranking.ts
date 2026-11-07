import type { RecipeStats } from './types';

// Bayesian average: a recipe with one 5-star rating should not outrank one
// with twenty 4.6-star ratings. Pull every recipe toward a neutral prior
// until it has enough votes to speak for itself.
const PRIOR_MEAN = 3;
const PRIOR_WEIGHT = 3;

export function consensusScore(stats: Pick<RecipeStats, 'avg_score' | 'rating_count'> | undefined): number {
  if (!stats || stats.rating_count === 0) return 0;
  const sum = stats.avg_score * stats.rating_count;
  return (PRIOR_MEAN * PRIOR_WEIGHT + sum) / (PRIOR_WEIGHT + stats.rating_count);
}

export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m =
    url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/) ??
    url.match(/[?&]v=([A-Za-z0-9_-]{11})/) ??
    url.match(/youtube\.com\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

export function youtubeThumb(url: string | null | undefined): string | null {
  const id = youtubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
}
