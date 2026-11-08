import { FunctionsHttpError } from '@supabase/supabase-js';

import { AVATAR_BUCKET, PHOTO_BUCKET, supabase } from './supabase';
import { fromISODate, weekStart } from './week';
import { fetchVideoText } from './youtube';
import type { ConvertedRecipe, Ingredient, Meal, MenuItem, Recipe, RecipeSource, RecipeStats, RecipeWithStats } from './types';

const RECIPE_SELECT = '*, author:profiles!recipes_author_id_fkey(display_name)';

type Vote = { recipe_id: string; user_id: string };

/** Menu votes count for the current week only (from Monday, local time), and for one home. */
function voteWeekStart(): string {
  return fromISODate(weekStart()).toISOString();
}

function withStats(recipes: Recipe[], stats: RecipeStats[], votes: Vote[], userId: string | undefined): RecipeWithStats[] {
  const byId = new Map(stats.map((s) => [s.recipe_id, s]));
  return recipes.map((r) => {
    const mine = votes.filter((v) => v.recipe_id === r.id);
    return {
      ...r,
      stats: byId.get(r.id) ?? { recipe_id: r.id, rating_count: 0, avg_score: 0 },
      votes: mine.length,
      myVote: mine.some((v) => v.user_id === userId),
    };
  });
}

/** The community's recipes, with community-wide ratings and `homeId`'s menu votes. */
export async function listRecipes(groupId: string, homeId: string | undefined): Promise<RecipeWithStats[]> {
  const { data: userData } = await supabase.auth.getUser();
  const [recipes, stats, votes] = await Promise.all([
    supabase.from('recipes').select(RECIPE_SELECT).eq('group_id', groupId).order('created_at', { ascending: false }),
    supabase.from('recipe_stats').select('recipe_id, rating_count, avg_score').eq('group_id', groupId),
    homeId
      ? supabase.from('menu_votes').select('recipe_id, user_id').eq('home_id', homeId).gte('created_at', voteWeekStart())
      : Promise.resolve({ data: [] as Vote[] }),
  ]);
  if (recipes.error) throw recipes.error;
  if (stats.error) throw stats.error;
  return withStats(recipes.data as Recipe[], stats.data as RecipeStats[], (votes.data ?? []) as Vote[], userData.user?.id);
}

export async function getRecipe(
  id: string,
  homeId: string | undefined,
): Promise<{ recipe: RecipeWithStats; myScore: number | null; timesOnMenu: number }> {
  const { data: userData } = await supabase.auth.getUser();
  const [recipe, stats, mine, menuCount, votes] = await Promise.all([
    supabase.from('recipes').select(RECIPE_SELECT).eq('id', id).single(),
    supabase.from('recipe_stats').select('recipe_id, rating_count, avg_score').eq('recipe_id', id).maybeSingle(),
    supabase.from('recipe_ratings').select('score').eq('recipe_id', id).eq('user_id', userData.user?.id ?? '').maybeSingle(),
    supabase.from('menu_items').select('id', { count: 'exact', head: true }).eq('recipe_id', id),
    homeId
      ? supabase.from('menu_votes').select('recipe_id, user_id').eq('recipe_id', id).eq('home_id', homeId).gte('created_at', voteWeekStart())
      : Promise.resolve({ data: [] as Vote[] }),
  ]);
  if (recipe.error) throw recipe.error;
  const [withS] = withStats(
    [recipe.data as Recipe],
    stats.data ? [stats.data as RecipeStats] : [],
    (votes.data ?? []) as Vote[],
    userData.user?.id,
  );
  return { recipe: withS, myScore: mine.data?.score ?? null, timesOnMenu: menuCount.count ?? 0 };
}

/** Vote (or un-vote) for a recipe to go on a home's weekly menu. */
export async function setMenuVote(recipeId: string, homeId: string, vote: boolean) {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user!.id;
  const q = vote
    ? // Re-voting in a new week refreshes the date so it counts for this week.
      supabase
        .from('menu_votes')
        .upsert({ recipe_id: recipeId, user_id: userId, home_id: homeId, created_at: new Date().toISOString() })
    : supabase.from('menu_votes').delete().eq('recipe_id', recipeId).eq('user_id', userId).eq('home_id', homeId);
  const { error } = await q;
  if (error) throw error;
}

export type RecipeInput = {
  group_id: string;
  title: string;
  description: string;
  servings: number | null;
  total_minutes: number | null;
  ingredients: Ingredient[];
  steps: string[];
  dietary_tags: string[];
  photo_path: string | null;
  image_url?: string | null;
  video_url: string | null;
  step_timestamps?: number[] | null;
  source: RecipeSource;
};

export async function createRecipe(input: RecipeInput): Promise<string> {
  const { data, error } = await supabase.from('recipes').insert(input).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function deleteRecipe(id: string) {
  const { error } = await supabase.from('recipes').delete().eq('id', id);
  if (error) throw error;
}

export async function rateRecipe(recipeId: string, score: number) {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('recipe_ratings')
    .upsert({ recipe_id: recipeId, user_id: userData.user!.id, score, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function uploadPhoto(groupId: string, uri: string, mimeType = 'image/jpeg'): Promise<string> {
  const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
  const path = `${groupId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const body = await fetch(uri).then((r) => r.arrayBuffer());
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, body, { contentType: mimeType });
  if (error) throw error;
  return path;
}

/** Upload a new profile picture for the signed-in user and replace the old one. */
export async function uploadAvatar(userId: string, uri: string, mimeType = 'image/jpeg', previous?: string | null): Promise<string> {
  const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
  // A new name each time so phones and browsers don't show a cached old picture.
  const path = `${userId}/${Date.now()}.${ext}`;
  const body = await fetch(uri).then((r) => r.arrayBuffer());
  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, body, { contentType: mimeType });
  if (error) throw error;
  const { error: saveError } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', userId);
  if (saveError) throw saveError;
  if (previous) await supabase.storage.from(AVATAR_BUCKET).remove([previous]);
  return path;
}

export async function removeAvatar(userId: string, path: string) {
  const { error } = await supabase.from('profiles').update({ avatar_path: null }).eq('id', userId);
  if (error) throw error;
  await supabase.storage.from(AVATAR_BUCKET).remove([path]);
}

async function callConverter<T>(body: object): Promise<T> {
  const { data, error } = await supabase.functions.invoke('convert-recipe', { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null);
      throw new Error(payload?.error ?? 'The converter had a problem. Try again.');
    }
    throw new Error("Couldn't reach the recipe converter. Check your connection.");
  }
  return data as T;
}

async function invokeConvert(body: object): Promise<ConvertedRecipe> {
  return (await callConverter<{ recipe: ConvertedRecipe }>(body)).recipe;
}

/**
 * Have Gemini pick a photo that really shows this dish (from Wikipedia,
 * Wikimedia Commons and TheMealDB) and save it on the recipe. Runs in the
 * background after saving, since it can take up to ~30 s.
 */
export async function attachRecipeImage(recipeId: string, title: string, description: string) {
  try {
    const { url } = await callConverter<{ url: string | null }>({ pickImage: title, description });
    if (url) await supabase.from('recipes').update({ image_url: url }).eq('id', recipeId);
  } catch {
    // No picture is fine: the card shows the placeholder.
  }
}

// Receipt lines that are almost never food: store charges, payment lines and
// household, personal-care and pet products. A safety net on top of Gemini's
// own filtering, so a stray line doesn't land in the pantry.
const NOT_FOOD =
  /\b(sub ?total|total|tax|hst|gst|pst|vat|deposit|eco ?fee|env(ironmental)? fee|crf|bag|bags|coupon|discount|savings?|saved|points?|rewards?|gift ?card|change|cash|visa|mastercard|debit|credit|balance|tender|refund|receipt|loyalty|member|battery|batteries|detergent|soap|dish ?soap|shampoo|conditioner|toothpaste|toothbrush|floss|tissues?|paper towels?|toilet|napkins?|plastic wrap|trash|garbage|cleaner|bleach|disinfect\w*|sponges?|diapers?|wipes|razors?|lotion|deodorant|sunscreen|vitamins?|supplements?|medicine|ibuprofen|acetaminophen|tylenol|advil|bandages?|pet|dog food|cat food|litter|cigarettes?|tobacco|vape|lottery|magazine|candles?|lighter|charcoal|light ?bulbs?|cards?)\b/i;

/** A real item name, not a code, price or store line ("4011", "#2231", "$3.99"). */
function looksLikeFood(name: string): boolean {
  const n = name.trim();
  return /[a-z]{3,}/i.test(n) && !NOT_FOOD.test(n);
}

/** Read a receipt or shopping-list photo into pantry items (food only). */
export async function readReceipt(base64: string, mediaType: string): Promise<Ingredient[]> {
  const { items } = await callConverter<{ items: Ingredient[] }>({ receiptBase64: base64, mediaType });
  return items.filter((i) => looksLikeFood(i.name));
}

export function convertPhoto(base64: string, mediaType: string) {
  return invokeConvert({ imageBase64: base64, mediaType });
}

export function convertText(text: string) {
  return invokeConvert({ text });
}

export async function convertYoutube(url: string) {
  // Send the transcript and description when this device can read them: the
  // server then writes the recipe (with step timestamps) from text in
  // seconds instead of watching the video.
  const text = await fetchVideoText(url);
  return invokeConvert({ youtubeUrl: url, title: text?.title, description: text?.description, transcript: text?.transcript });
}

// --- Weekly menu (per home) -----------------------------------------------

export async function listMenu(homeId: string, week: string): Promise<MenuItem[]> {
  const { data, error } = await supabase
    .from('menu_items')
    .select('*, recipe:recipes(*)')
    .eq('home_id', homeId)
    .eq('week_start', week)
    .order('created_at');
  if (error) throw error;
  return data as MenuItem[];
}

export async function addMenuItem(homeId: string, week: string, day: number, meal: Meal, recipeId: string, servings: number) {
  const { error } = await supabase
    .from('menu_items')
    .insert({ home_id: homeId, week_start: week, day, meal, recipe_id: recipeId, servings });
  if (error) throw error;
}

export async function removeMenuItem(id: string) {
  const { error } = await supabase.from('menu_items').delete().eq('id', id);
  if (error) throw error;
}

// --- Groceries --------------------------------------------------------------

export type GroceryExtra = { id: string; name: string; quantity: number; unit: string };

export async function listGroceryState(homeId: string, week: string) {
  const [checks, extras] = await Promise.all([
    supabase.from('grocery_checks').select('item_key').eq('home_id', homeId).eq('week_start', week),
    supabase.from('grocery_extras').select('id, name, quantity, unit').eq('home_id', homeId).eq('week_start', week).order('created_at'),
  ]);
  if (checks.error) throw checks.error;
  if (extras.error) throw extras.error;
  return {
    checked: new Set((checks.data ?? []).map((c) => c.item_key)),
    extras: (extras.data ?? []) as GroceryExtra[],
  };
}

export async function setChecked(homeId: string, week: string, key: string, checked: boolean) {
  if (checked) {
    const { error } = await supabase.from('grocery_checks').upsert({ home_id: homeId, week_start: week, item_key: key });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('grocery_checks')
      .delete()
      .eq('home_id', homeId)
      .eq('week_start', week)
      .eq('item_key', key);
    if (error) throw error;
  }
}

export async function addGroceryExtra(homeId: string, week: string, name: string) {
  const { error } = await supabase.from('grocery_extras').insert({ home_id: homeId, week_start: week, name: name.trim() });
  if (error) throw error;
}

export async function removeGroceryExtra(id: string) {
  const { error } = await supabase.from('grocery_extras').delete().eq('id', id);
  if (error) throw error;
}

// --- Members ----------------------------------------------------------------

export type Member = { user_id: string; role: 'admin' | 'member'; display_name: string };

export async function listMembers(groupId: string): Promise<Member[]> {
  const { data, error } = await supabase
    .from('group_members')
    .select('user_id, role, profile:profiles(display_name)')
    .eq('group_id', groupId)
    .order('joined_at');
  if (error) throw error;
  return (data as unknown as { user_id: string; role: 'admin' | 'member'; profile: { display_name: string } | null }[]).map(
    (m) => ({ user_id: m.user_id, role: m.role, display_name: m.profile?.display_name || 'Member' }),
  );
}

export async function setMemberRole(groupId: string, userId: string, role: 'admin' | 'member') {
  const { error } = await supabase.from('group_members').update({ role }).eq('group_id', groupId).eq('user_id', userId);
  if (error) throw error;
}
